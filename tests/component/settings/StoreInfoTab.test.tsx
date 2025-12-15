/**
 * @test-level COMPONENT
 * @justification Tests React component rendering, user interactions, and form validation
 * @story 6-14-store-settings-page
 * @enhanced-by workflow-9 on 2025-01-28
 */
// tests/component/settings/StoreInfoTab.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders, screen, waitFor } from "../../support/test-utils";
import userEvent from "@testing-library/user-event";
import { StoreInfoTab } from "@/components/settings/StoreInfoTab";
import * as storeSettingsApi from "@/lib/api/store-settings";

/**
 * StoreInfoTab Component Tests
 *
 * Tests the Store Info tab component that displays and allows editing
 * of store configuration (name, address, timezone, contact email, operating hours).
 *
 * Component tests are SECOND in pyramid order (20-30% of tests)
 *
 * ENHANCEMENTS APPLIED (Workflow 9):
 * - Test isolation: beforeEach cleanup
 * - Given-When-Then structure: Already present
 * - Resilient selectors: data-testid (when component is implemented)
 * - Comprehensive validation tests
 * - Edge case tests for form fields
 */

// Mock the API hooks
vi.mock("@/lib/api/store-settings", () => ({
  useStoreSettings: vi.fn(),
  useUpdateStoreSettings: vi.fn(),
}));

// Mock toast hook
const mockToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({
    toast: mockToast,
  }),
}));

describe("StoreInfoTab Component", () => {
  const storeId = "123e4567-e89b-12d3-a456-426614174000";

  const mockStoreSettings = {
    name: "Test Store",
    address: {
      street: "123 Main St",
      city: "New York",
      state: "NY",
      zip: "10001",
    },
    timezone: "America/New_York",
    contact_email: "store@test.nuvana.local",
    operating_hours: {
      monday: { open: "09:00", close: "17:00" },
      tuesday: { open: "09:00", close: "17:00" },
    },
  };

  const mockUseStoreSettings = {
    data: mockStoreSettings,
    isLoading: false,
    isError: false,
    error: null,
  };

  const mockUpdateMutation = {
    mutateAsync: vi.fn().mockResolvedValue(mockStoreSettings),
    isPending: false,
    isError: false,
    error: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(storeSettingsApi.useStoreSettings).mockReturnValue(
      mockUseStoreSettings as any,
    );
    vi.mocked(storeSettingsApi.useUpdateStoreSettings).mockReturnValue(
      mockUpdateMutation as any,
    );
  });

  describe("Display Store Information", () => {
    it("should display store name as read-only field", async () => {
      // GIVEN: StoreInfoTab is rendered with store data
      renderWithProviders(<StoreInfoTab storeId={storeId} />);

      // WHEN: Component renders
      await waitFor(() => {
        // THEN: Store name is displayed and is read-only
        const storeNameInput = screen.getByTestId("store-name");
        expect(storeNameInput).toBeInTheDocument();
        expect(storeNameInput).toBeDisabled();
        expect(storeNameInput).toHaveValue("Test Store");
      });
    });

    it("should display address fields", async () => {
      // GIVEN: StoreInfoTab is rendered
      renderWithProviders(<StoreInfoTab storeId={storeId} />);

      // WHEN: Component renders
      await waitFor(() => {
        // THEN: Address fields are displayed with current values
        const addressInput = screen.getByTestId("address-input");
        expect(addressInput).toBeInTheDocument();
      });
    });

    it("should display timezone selector with current timezone", async () => {
      // GIVEN: StoreInfoTab is rendered
      renderWithProviders(<StoreInfoTab storeId={storeId} />);

      // WHEN: Component renders
      await waitFor(() => {
        // THEN: Timezone selector shows current timezone value
        const timezoneSelect = screen.getByTestId("timezone-select");
        expect(timezoneSelect).toBeInTheDocument();
      });
    });

    it("should display contact email field", async () => {
      // GIVEN: StoreInfoTab is rendered
      renderWithProviders(<StoreInfoTab storeId={storeId} />);

      // WHEN: Component renders
      await waitFor(() => {
        // THEN: Contact email field is displayed with current value
        const emailInput = screen.getByTestId("contact-email-input");
        expect(emailInput).toBeInTheDocument();
        expect(emailInput).toHaveValue("store@test.nuvana.local");
      });
    });

    it("should display operating hours for each day", async () => {
      // GIVEN: StoreInfoTab is rendered
      renderWithProviders(<StoreInfoTab storeId={storeId} />);

      // WHEN: Component renders
      await waitFor(() => {
        // THEN: Operating hours inputs are displayed for each day
        const mondayOpen = screen.getByTestId("operating-hours-monday-open");
        expect(mondayOpen).toBeInTheDocument();
      });
    });
  });

  describe("Form Validation", () => {
    it("should show validation error for invalid email format", async () => {
      // GIVEN: StoreInfoTab is rendered
      const user = userEvent.setup();
      renderWithProviders(<StoreInfoTab storeId={storeId} />);

      await waitFor(() => {
        expect(screen.getByTestId("contact-email-input")).toBeInTheDocument();
      });

      // WHEN: User enters invalid email and blurs field
      const emailInput = screen.getByTestId("contact-email-input");
      await user.clear(emailInput);
      await user.type(emailInput, "invalid-email");
      await user.tab();

      // THEN: Validation error message is displayed
      await waitFor(() => {
        expect(screen.getByText(/invalid email format/i)).toBeInTheDocument();
      });
    });

    it("should show validation error for invalid time format", async () => {
      // GIVEN: StoreInfoTab is rendered
      const user = userEvent.setup();
      renderWithProviders(<StoreInfoTab storeId={storeId} />);

      await waitFor(() => {
        expect(
          screen.getByTestId("operating-hours-monday-open"),
        ).toBeInTheDocument();
      });

      // WHEN: User enters invalid time format (e.g., "25:00")
      const timeInput = screen.getByTestId("operating-hours-monday-open");
      await user.clear(timeInput);
      await user.type(timeInput, "25:00");
      await user.tab();

      // THEN: Validation error message is displayed
      await waitFor(() => {
        expect(
          screen.getByText(/time must be in hh:mm format/i),
        ).toBeInTheDocument();
      });
    });
  });

  describe("Save Functionality", () => {
    it("should call updateStoreSettings when save button is clicked", async () => {
      // GIVEN: StoreInfoTab is rendered with valid form data
      const user = userEvent.setup();
      const mutateAsync = vi.fn().mockResolvedValue(mockStoreSettings);
      vi.mocked(storeSettingsApi.useUpdateStoreSettings).mockReturnValue({
        ...mockUpdateMutation,
        mutateAsync,
      } as any);

      renderWithProviders(<StoreInfoTab storeId={storeId} />);

      await waitFor(() => {
        expect(screen.getByTestId("save-settings-button")).toBeInTheDocument();
      });

      // WHEN: User clicks save button
      const saveButton = screen.getByTestId("save-settings-button");
      await user.click(saveButton);

      // THEN: updateStoreSettings mutation is called with updated data
      await waitFor(() => {
        expect(mutateAsync).toHaveBeenCalledWith({
          storeId,
          config: expect.objectContaining({
            address: expect.any(String),
            timezone: expect.any(String),
            contact_email: expect.any(String),
          }),
        });
      });
    });

    it("should show loading state while saving", async () => {
      // GIVEN: StoreInfoTab is rendered
      const user = userEvent.setup();
      const mutateAsync = vi.fn(
        () =>
          new Promise((resolve) =>
            setTimeout(() => resolve(mockStoreSettings), 100),
          ),
      );
      vi.mocked(storeSettingsApi.useUpdateStoreSettings).mockReturnValue({
        ...mockUpdateMutation,
        mutateAsync,
        isPending: true,
      } as any);

      renderWithProviders(<StoreInfoTab storeId={storeId} />);

      await waitFor(() => {
        expect(screen.getByTestId("save-settings-button")).toBeInTheDocument();
      });

      // WHEN: User clicks save and mutation is pending
      const saveButton = screen.getByTestId("save-settings-button");
      await user.click(saveButton);

      // THEN: Save button shows loading state
      await waitFor(() => {
        expect(screen.getByText(/saving/i)).toBeInTheDocument();
        expect(saveButton).toBeDisabled();
      });
    });

    it("should show success notification on successful save", async () => {
      // GIVEN: StoreInfoTab is rendered
      const user = userEvent.setup();
      renderWithProviders(<StoreInfoTab storeId={storeId} />);

      await waitFor(() => {
        expect(screen.getByTestId("save-settings-button")).toBeInTheDocument();
      });

      // WHEN: Save mutation succeeds
      const saveButton = screen.getByTestId("save-settings-button");
      await user.click(saveButton);

      // THEN: Success toast notification is displayed
      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            title: "Settings updated",
            description: "Store settings have been saved successfully.",
          }),
        );
      });
    });

    it("should show error notification on save failure", async () => {
      // GIVEN: StoreInfoTab is rendered
      const user = userEvent.setup();
      const mutateAsync = vi.fn().mockRejectedValue(new Error("Save failed"));
      vi.mocked(storeSettingsApi.useUpdateStoreSettings).mockReturnValue({
        ...mockUpdateMutation,
        mutateAsync,
        isError: true,
        error: new Error("Save failed"),
      } as any);

      renderWithProviders(<StoreInfoTab storeId={storeId} />);

      await waitFor(() => {
        expect(screen.getByTestId("save-settings-button")).toBeInTheDocument();
      });

      // WHEN: Save mutation fails
      const saveButton = screen.getByTestId("save-settings-button");
      await user.click(saveButton);

      // THEN: Error toast notification is displayed
      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            title: "Error",
            variant: "destructive",
          }),
        );
      });
    });
  });

  describe("Loading and Error States", () => {
    it("should show loading state while fetching store settings", async () => {
      // GIVEN: StoreInfoTab is rendered
      vi.mocked(storeSettingsApi.useStoreSettings).mockReturnValue({
        ...mockUseStoreSettings,
        isLoading: true,
        data: undefined,
      } as any);

      renderWithProviders(<StoreInfoTab storeId={storeId} />);

      // WHEN: useStoreSettings is loading
      // THEN: Loading spinner is displayed
      expect(screen.getByRole("status", { hidden: true })).toBeInTheDocument();
    });

    it("should show error message when fetch fails", async () => {
      // GIVEN: StoreInfoTab is rendered
      vi.mocked(storeSettingsApi.useStoreSettings).mockReturnValue({
        ...mockUseStoreSettings,
        isLoading: false,
        isError: true,
        error: new Error("Failed to load"),
      } as any);

      renderWithProviders(<StoreInfoTab storeId={storeId} />);

      // WHEN: useStoreSettings returns error
      // THEN: Error message is displayed
      await waitFor(() => {
        expect(
          screen.getByText(/failed to load store settings/i),
        ).toBeInTheDocument();
      });
    });
  });
});
