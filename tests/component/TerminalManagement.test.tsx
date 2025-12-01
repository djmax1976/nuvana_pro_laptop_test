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
      expect(screen.getByText("Add Terminal")).toBeInTheDocument();
      expect(
        screen.getByText(/Create a new POS terminal for this store/i),
      ).toBeInTheDocument();
    });

    it("[P0] Should create terminal with valid data", async () => {
      // GIVEN: Form is rendered and create dialog is open
      const user = userEvent.setup();
      renderWithProviders(
        <StoreForm companyId={companyId} store={mockStore} />,
      );

      const addButton = screen.getByRole("button", { name: /Add Terminal/i });
      await user.click(addButton);

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

      // WHEN: User clicks edit button for a terminal
      const editButtons = screen.getAllByRole("button", { name: "" });
      const editButton = editButtons.find((btn) =>
        btn.querySelector('svg[class*="Edit"]'),
      );
      expect(editButton).toBeDefined();
      await user.click(editButton!);

      // THEN: Edit terminal dialog should be visible
      expect(screen.getByText("Edit Terminal")).toBeInTheDocument();
      expect(
        screen.getByText(/Update terminal information/i),
      ).toBeInTheDocument();
    });

    it("[P0] Should pre-fill form with terminal data when editing", async () => {
      // GIVEN: Form is rendered with store that has terminals
      const user = userEvent.setup();
      renderWithProviders(
        <StoreForm companyId={companyId} store={mockStore} />,
      );

      // WHEN: User clicks edit button
      const editButtons = screen.getAllByRole("button", { name: "" });
      const editButton = editButtons.find((btn) =>
        btn.querySelector('svg[class*="Edit"]'),
      );
      await user.click(editButton!);

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

      const editButtons = screen.getAllByRole("button", { name: "" });
      const editButton = editButtons.find((btn) =>
        btn.querySelector('svg[class*="Edit"]'),
      );
      await user.click(editButton!);

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

      const editButtons = screen.getAllByRole("button", { name: "" });
      const editButton = editButtons.find((btn) =>
        btn.querySelector('svg[class*="Edit"]'),
      );
      await user.click(editButton!);

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

      // WHEN: User clicks delete button
      const deleteButtons = screen.getAllByRole("button", { name: "" });
      const deleteButton = deleteButtons.find((btn) =>
        btn.querySelector('svg[class*="Trash"]'),
      );
      expect(deleteButton).toBeDefined();
      await user.click(deleteButton!);

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
      const deleteButtons = screen.getAllByRole("button", { name: "" });
      const deleteButton = deleteButtons.find((btn) =>
        btn.querySelector('svg[class*="Trash"]'),
      );
      await user.click(deleteButton!);

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
      const deleteButtons = screen.getAllByRole("button", { name: "" });
      const deleteButton = deleteButtons.find((btn) =>
        btn.querySelector('svg[class*="Trash"]'),
      );
      await user.click(deleteButton!);

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
      const deleteButtons = screen.getAllByRole("button", { name: "" });
      const terminal2DeleteButton = deleteButtons.find(
        (btn) =>
          btn.querySelector('svg[class*="Trash"]') &&
          btn.closest('[class*="border"]')?.textContent?.includes("Terminal 2"),
      );
      expect(terminal2DeleteButton).toBeDefined();
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
      const deleteButtons = screen.getAllByRole("button", { name: "" });
      const deleteButton = deleteButtons.find((btn) =>
        btn.querySelector('svg[class*="Trash"]'),
      );
      await user.click(deleteButton!);

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
});
