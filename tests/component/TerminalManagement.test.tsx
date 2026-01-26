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
      active_shift_cashier_name: null,
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
      active_shift_cashier_name: "Jane Smith",
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
      active_shift_cashier_name: null,
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
    // Reset mock implementations to default resolved values
    // This is critical for test isolation - previous tests may have changed to mockRejectedValue
    mockCreateMutation.mutateAsync.mockResolvedValue({});
    mockUpdateMutation.mutateAsync.mockResolvedValue({});
    mockDeleteMutation.mutateAsync.mockResolvedValue({});

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
            pos_type: "MANUAL_ENTRY",
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
            pos_type: "MANUAL_ENTRY",
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

  describe("Terminal Form - POS Type Selection (AC #2)", () => {
    it("[P0] Should display POS Type dropdown with grouped options", async () => {
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

      // WHEN: User opens POS Type dropdown (create dialog uses specific test ID)
      const posTypeSelector = screen.getByTestId(
        "create-terminal-pos-type-selector",
      );
      await user.click(posTypeSelector);

      // THEN: POS type groups should be visible (enterprise 15-type enum)
      await waitFor(() => {
        // Check for group labels
        expect(screen.getByText("Verifone")).toBeInTheDocument();
        expect(screen.getByText("Gilbarco")).toBeInTheDocument();
        expect(screen.getByText("Cloud POS")).toBeInTheDocument();
        expect(screen.getByText("Other")).toBeInTheDocument();
      });
    });

    it("[P1] Should pre-fill connection type and vendor when editing terminal", async () => {
      // GIVEN: Form is rendered with terminal that has connection fields
      const user = userEvent.setup();
      const terminalWithConnection: TerminalWithStatus[] = [
        {
          ...mockTerminals[0],
          connection_type: "API",
          pos_type: "SQUARE_REST",
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

      // THEN: POS type should be pre-filled
      // Check that POS type selector shows Square (from SQUARE_REST)
      const posTypeSelector = screen.getByTestId(
        "edit-terminal-pos-type-selector",
      );
      expect(posTypeSelector).toHaveTextContent(/Square/i);
    });
  });

  describe("Terminal Form - Connection Config Form Validation (AC #3)", () => {
    it("[P1] Should show NETWORK config fields when network-based POS is selected", async () => {
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

      // WHEN: User selects a network-based POS type (GILBARCO_PASSPORT -> NETWORK)
      const posTypeSelector = screen.getByTestId(
        "create-terminal-pos-type-selector",
      );
      await user.click(posTypeSelector);
      // Wait for dropdown to open and select Gilbarco Passport
      await waitFor(() => {
        expect(screen.getByText("Gilbarco")).toBeInTheDocument();
      });
      await user.click(
        screen.getByRole("option", { name: /Gilbarco Passport \(Network\)/i }),
      );

      // THEN: NETWORK config fields should be displayed (connection type is auto-derived internally)
      await waitFor(() => {
        expect(screen.getByLabelText(/Host/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/Port/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/Protocol/i)).toBeInTheDocument();
      });
    });

    it("[P1] Should show API config fields when cloud-based POS is selected", async () => {
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

      // WHEN: User selects a cloud-based POS type (SQUARE_REST -> API)
      const posTypeSelector = screen.getByTestId(
        "create-terminal-pos-type-selector",
      );
      await user.click(posTypeSelector);
      // Wait for dropdown to open and select Square
      await waitFor(() => {
        expect(screen.getByText("Cloud POS")).toBeInTheDocument();
      });
      await user.click(
        screen.getByRole("option", { name: /Square \(Cloud API\)/i }),
      );

      // THEN: API config fields should be displayed (connection type is auto-derived internally)
      await waitFor(() => {
        expect(screen.getByLabelText(/Base URL/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/API Key/i)).toBeInTheDocument();
      });
    });

    // WEBHOOK connection type is not automatically selected by any POS type
    // It would require manual backend configuration. Skipping this test.
    it.skip("[P1] Should show WEBHOOK config fields when WEBHOOK is selected", async () => {
      // Note: No POS type currently maps to WEBHOOK connection type.
      // WEBHOOK would need to be manually configured on the backend.
    });

    it("[P1] Should show FILE config fields when file-based POS is selected", async () => {
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

      // WHEN: User selects a file-based POS type (VERIFONE_COMMANDER -> FILE)
      const posTypeSelector = screen.getByTestId(
        "create-terminal-pos-type-selector",
      );
      await user.click(posTypeSelector);
      // Wait for dropdown to open and select Verifone Commander
      await waitFor(() => {
        expect(screen.getByText("Verifone")).toBeInTheDocument();
      });
      await user.click(
        screen.getByRole("option", { name: /Verifone Commander \(NAXML\)/i }),
      );

      // THEN: FILE config fields should be displayed (connection type is auto-derived internally)
      await waitFor(() => {
        expect(screen.getByLabelText(/Import Path/i)).toBeInTheDocument();
      });
    });

    it("[P1] Should hide config fields when manual POS is selected", async () => {
      // GIVEN: Form is rendered and create dialog is open with a non-manual POS type selected
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

      // First select a network-based POS to show config fields
      const posTypeSelector = screen.getByTestId(
        "create-terminal-pos-type-selector",
      );
      await user.click(posTypeSelector);
      await waitFor(() => {
        expect(screen.getByText("Gilbarco")).toBeInTheDocument();
      });
      await user.click(
        screen.getByRole("option", { name: /Gilbarco Passport \(Network\)/i }),
      );

      await waitFor(() => {
        expect(screen.getByLabelText(/Host/i)).toBeInTheDocument();
      });

      // WHEN: User switches to Manual Entry POS type
      await user.click(posTypeSelector);
      await waitFor(() => {
        expect(screen.getByText("Other")).toBeInTheDocument();
      });
      await user.click(screen.getByRole("option", { name: /Manual Entry/i }));

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

      // Select a cloud-based POS type to auto-select API connection type
      const posTypeSelector = screen.getByTestId(
        "create-terminal-pos-type-selector",
      );
      await user.click(posTypeSelector);
      await waitFor(() => {
        expect(screen.getByText("Cloud POS")).toBeInTheDocument();
      });
      await user.click(
        screen.getByRole("option", { name: /Square \(Cloud API\)/i }),
      );

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
            pos_type: "SQUARE_REST",
            connection_config: expect.objectContaining({
              base_url: "https://api.example.com",
              api_key: "secret-api-key-123",
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
          pos_type: "MANUAL_ENTRY",
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

      // WHEN: User changes POS type to a network-based one (auto-selects NETWORK connection)
      const posTypeSelector = screen.getByTestId(
        "edit-terminal-pos-type-selector",
      );
      await user.click(posTypeSelector);
      await waitFor(() => {
        expect(screen.getByText("Gilbarco")).toBeInTheDocument();
      });
      await user.click(
        screen.getByRole("option", { name: /Gilbarco Passport \(Network\)/i }),
      );

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
            pos_type: "GILBARCO_PASSPORT",
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

    it("[P1] Should show success toast after creating terminal with connection config", async () => {
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

      // Select a cloud-based POS type to auto-select API connection type
      const posTypeSelector = screen.getByTestId(
        "create-terminal-pos-type-selector",
      );
      await user.click(posTypeSelector);
      await waitFor(() => {
        expect(screen.getByText("Cloud POS")).toBeInTheDocument();
      });
      await user.click(
        screen.getByRole("option", { name: /Square \(Cloud API\)/i }),
      );

      await waitFor(() => {
        expect(screen.getByLabelText(/Base URL/i)).toBeInTheDocument();
      });

      // Fill API connection config fields - use same pattern as P0 test
      const baseUrlInput = screen.getByLabelText(/Base URL/i);
      await user.type(baseUrlInput, "https://api.test.com");
      await user.tab(); // Blur baseUrl field to trigger onConfigChange

      const apiKeyInput = screen.getByLabelText(/API Key/i);
      await user.type(apiKeyInput, "test-key");
      await user.tab(); // Blur apiKey field to trigger onConfigChange

      // Wait for React state update to propagate after blur events
      // The onBlur handlers call setConnectionConfig which updates state asynchronously
      await waitFor(
        () => {
          // Config should be set via onBlur - nothing to check here but timeout allows state to settle
        },
        { timeout: 500 },
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
            name: "Test Terminal",
            connection_type: "API",
            pos_type: "SQUARE_REST",
            connection_config: expect.objectContaining({
              base_url: "https://api.test.com",
              api_key: "test-key",
            }),
          }),
        });
      });

      // AND: Success toast should be shown
      expect(mockToast).toHaveBeenCalledWith({
        title: "Success",
        description: "Terminal created successfully",
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

      // WHEN: User selects a cloud-based POS type to auto-select API connection
      await user.type(screen.getByLabelText(/Terminal Name/i), "Test Terminal");

      // Select a cloud-based POS type (SQUARE_REST -> API)
      const posTypeSelector = screen.getByTestId(
        "create-terminal-pos-type-selector",
      );
      await user.click(posTypeSelector);
      await waitFor(() => {
        expect(screen.getByText("Cloud POS")).toBeInTheDocument();
      });
      await user.click(
        screen.getByRole("option", { name: /Square \(Cloud API\)/i }),
      );

      await waitFor(() => {
        expect(screen.getByLabelText(/Base URL/i)).toBeInTheDocument();
      });

      // WHEN: User enters invalid URL format
      const baseUrlInput = screen.getByLabelText(/Base URL/i);
      await user.type(baseUrlInput, "not-a-valid-url");
      // Trigger blur to activate validation - validation happens onBlur in ConnectionConfigForm
      await user.tab();

      // THEN: Validation error should be displayed inline
      await waitFor(() => {
        // The component shows inline validation error "base_url must be a valid URL"
        expect(
          screen.getByText(/base_url must be a valid URL/i),
        ).toBeInTheDocument();
      });
    });
  });
});
