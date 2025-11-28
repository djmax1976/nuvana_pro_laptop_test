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
import type { Store } from "@/lib/api/stores";

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
}));

// Mock toast hook
const mockToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({
    toast: mockToast,
  }),
}));

describe("2.4-COMPONENT: StoreForm Component", () => {
  const companyId = "123e4567-e89b-12d3-a456-426614174000";

  const mockStore: Store = {
    store_id: "223e4567-e89b-12d3-a456-426614174001",
    company_id: companyId,
    name: "Existing Store",
    location_json: {
      address: "123 Main St",
    },
    timezone: "America/New_York",
    status: "ACTIVE",
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  };

  const mockCreateMutation = {
    mutateAsync: vi.fn().mockResolvedValue(mockStore),
    isLoading: false,
    isError: false,
    error: null,
  };

  const mockUpdateMutation = {
    mutateAsync: vi.fn().mockResolvedValue(mockStore),
    isLoading: false,
    isError: false,
    error: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(storesApi.useCreateStore).mockReturnValue(
      mockCreateMutation as any,
    );
    vi.mocked(storesApi.useUpdateStore).mockReturnValue(
      mockUpdateMutation as any,
    );
  });

  it("[P1] 2.4-COMPONENT-018: should render all form fields", () => {
    // GIVEN: Form is rendered for creating a new store
    renderWithProviders(<StoreForm companyId={companyId} />);

    // THEN: All form fields should be present
    expect(screen.getByLabelText(/Store Name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Timezone/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Status/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Create Store/i }),
    ).toBeInTheDocument();
  });

  it("[P0] 2.4-COMPONENT-019: should display validation error when name is empty", async () => {
    // GIVEN: Form is rendered
    const user = userEvent.setup();
    renderWithProviders(<StoreForm companyId={companyId} />);

    // WHEN: User submits form without filling name
    const submitButton = screen.getByRole("button", { name: /Create Store/i });
    await user.click(submitButton);

    // THEN: Validation error should be displayed
    await waitFor(() => {
      expect(screen.getByText(/Store name is required/i)).toBeInTheDocument();
    });
  });

  it("[P0] 2.4-COMPONENT-020: should display validation error when name exceeds 255 characters", async () => {
    // GIVEN: Form is rendered
    const user = userEvent.setup();
    renderWithProviders(<StoreForm companyId={companyId} />);

    // WHEN: User enters name longer than 255 characters
    // Using fireEvent.change instead of userEvent.type for performance
    // (typing 256 chars one-by-one causes timeout)
    const nameInput = screen.getByLabelText(/Store Name/i);
    fireEvent.change(nameInput, { target: { value: "a".repeat(256) } });
    const submitButton = screen.getByRole("button", { name: /Create Store/i });
    await user.click(submitButton);

    // THEN: Validation error should be displayed
    await waitFor(() => {
      expect(
        screen.getByText(/Store name must be 255 characters or less/i),
      ).toBeInTheDocument();
    });
  });

  it("[P0] 2.4-COMPONENT-021: should display validation error for invalid timezone format", async () => {
    // GIVEN: Form is rendered
    const user = userEvent.setup();
    renderWithProviders(<StoreForm companyId={companyId} />);

    // WHEN: User enters invalid timezone
    const nameInput = screen.getByLabelText(/Store Name/i);
    await user.type(nameInput, "Test Store");
    const timezoneInput = screen.getByLabelText(/Timezone/i);
    await user.clear(timezoneInput);
    await user.type(timezoneInput, "Invalid-Timezone");
    const submitButton = screen.getByRole("button", { name: /Create Store/i });
    await user.click(submitButton);

    // THEN: Validation error should be displayed
    await waitFor(() => {
      expect(
        screen.getByText(/Timezone must be in IANA format/i),
      ).toBeInTheDocument();
    });
  });

  it("[P1] 2.4-COMPONENT-022: should accept valid IANA timezone format", async () => {
    // GIVEN: Form is rendered
    const user = userEvent.setup();
    renderWithProviders(<StoreForm companyId={companyId} />);

    // WHEN: User enters valid timezone (default is already America/New_York, so just fill name)
    const nameInput = screen.getByLabelText(/Store Name/i);
    await user.type(nameInput, "Test Store");
    const submitButton = screen.getByRole("button", { name: /Create Store/i });
    await user.click(submitButton);

    // THEN: Form should submit successfully
    await waitFor(() => {
      expect(mockCreateMutation.mutateAsync).toHaveBeenCalled();
    });
  });

  it("[P1] 2.4-COMPONENT-026: should pre-fill form fields when editing existing store", () => {
    // GIVEN: Form is rendered with existing store data
    renderWithProviders(<StoreForm companyId={companyId} store={mockStore} />);

    // THEN: Form fields should be pre-filled
    const nameInput = screen.getByLabelText(/Store Name/i) as HTMLInputElement;
    expect(nameInput.value).toBe("Existing Store");
    const timezoneInput = screen.getByLabelText(
      /Timezone/i,
    ) as HTMLInputElement;
    expect(timezoneInput.value).toBe("America/New_York");
    expect(
      screen.getByRole("button", { name: /Update Store/i }),
    ).toBeInTheDocument();
  });

  it("[P0] 2.4-COMPONENT-027: should call createStore mutation when creating new store", async () => {
    // GIVEN: Form is rendered for creating
    const user = userEvent.setup();
    renderWithProviders(<StoreForm companyId={companyId} />);

    // WHEN: User fills and submits form
    const nameInput = screen.getByLabelText(/Store Name/i);
    await user.type(nameInput, "New Store");
    const submitButton = screen.getByRole("button", { name: /Create Store/i });
    await user.click(submitButton);

    // THEN: Create mutation should be called
    await waitFor(
      () => {
        expect(mockCreateMutation.mutateAsync).toHaveBeenCalledWith({
          companyId,
          data: expect.objectContaining({
            name: "New Store",
            timezone: "America/New_York", // Default value
            status: "ACTIVE", // Default value
          }),
        });
      },
      { timeout: 3000 },
    );
  });

  it("[P0] 2.4-COMPONENT-028: should call updateStore mutation when updating existing store", async () => {
    // GIVEN: Form is rendered with existing store
    const user = userEvent.setup();
    renderWithProviders(<StoreForm companyId={companyId} store={mockStore} />);

    // WHEN: User updates name and submits
    const nameInput = screen.getByLabelText(/Store Name/i);
    await user.clear(nameInput);
    await user.type(nameInput, "Updated Store");
    const submitButton = screen.getByRole("button", { name: /Update Store/i });
    await user.click(submitButton);

    // THEN: Update mutation should be called
    await waitFor(() => {
      expect(mockUpdateMutation.mutateAsync).toHaveBeenCalledWith({
        storeId: mockStore.store_id,
        data: expect.objectContaining({
          name: "Updated Store",
        }),
      });
    });
  });

  it("[P1] 2.4-COMPONENT-029: should display success toast after successful creation", async () => {
    // GIVEN: Form is rendered
    const user = userEvent.setup();
    renderWithProviders(<StoreForm companyId={companyId} />);

    // WHEN: User successfully creates store
    const nameInput = screen.getByLabelText(/Store Name/i);
    await user.type(nameInput, "New Store");
    const submitButton = screen.getByRole("button", { name: /Create Store/i });
    await user.click(submitButton);

    // THEN: Success toast should be displayed
    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith({
        title: "Success",
        description: "Store created successfully",
      });
    });
  });

  it("[P1] 2.4-COMPONENT-030: should display error toast on API error", async () => {
    // GIVEN: Create mutation fails
    const errorMutation = {
      mutateAsync: vi.fn().mockRejectedValue(new Error("API Error")),
      isLoading: false,
      isError: false,
      error: null,
    };
    vi.mocked(storesApi.useCreateStore).mockReturnValue(errorMutation as any);

    const user = userEvent.setup();
    renderWithProviders(<StoreForm companyId={companyId} />);

    // WHEN: User submits form
    const nameInput = screen.getByLabelText(/Store Name/i);
    await user.type(nameInput, "New Store");
    const submitButton = screen.getByRole("button", { name: /Create Store/i });
    await user.click(submitButton);

    // THEN: Error toast should be displayed
    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith({
        title: "Error",
        description: "API Error",
        variant: "destructive",
      });
    });
  });

  it("[P1] 2.4-COMPONENT-031: should disable form fields during submission", async () => {
    // GIVEN: Mutation will take time to resolve (simulating loading)
    const user = userEvent.setup();
    let resolveMutation: (value: any) => void;
    const pendingMutation = {
      mutateAsync: vi.fn(
        () =>
          new Promise((resolve) => {
            resolveMutation = resolve;
          }),
      ),
      isLoading: false,
      isError: false,
      error: null,
    };
    vi.mocked(storesApi.useCreateStore).mockReturnValue(pendingMutation as any);

    renderWithProviders(<StoreForm companyId={companyId} />);

    // WHEN: User submits form
    const nameInput = screen.getByLabelText(/Store Name/i);
    await user.type(nameInput, "Test Store");
    const submitButton = screen.getByRole("button", { name: /Create Store/i });
    await user.click(submitButton);

    // THEN: Form fields should be disabled and button shows "Saving..."
    await waitFor(() => {
      expect(nameInput).toBeDisabled();
      expect(
        screen.getByRole("button", { name: /Saving/i }),
      ).toBeInTheDocument();
    });

    // Cleanup: resolve the mutation
    resolveMutation!(mockStore);
  });
});
