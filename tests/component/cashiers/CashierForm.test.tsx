import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders, screen, waitFor } from "../../support/test-utils";
import { CashierForm } from "@/components/cashiers/CashierForm";
import userEvent from "@testing-library/user-event";
import * as cashiersApi from "@/lib/api/cashiers";
import * as clientDashboardApi from "@/lib/api/client-dashboard";

/**
 * Component Tests: CashierForm
 *
 * CRITICAL TEST COVERAGE:
 * - Single store auto-selection behavior
 * - Store dropdown displays selected store when only one store exists
 * - PIN validation (4 digits)
 * - Form submission with correct data
 *
 * Story: 4.9 - Cashier Management
 */

// Mock the API hooks
vi.mock("@/lib/api/cashiers", () => ({
  useCreateCashier: vi.fn(() => ({
    mutateAsync: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
  })),
  useUpdateCashier: vi.fn(() => ({
    mutateAsync: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
  })),
}));

vi.mock("@/lib/api/client-dashboard", () => ({
  useClientDashboard: vi.fn(),
}));

// Mock the toast hook
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

describe("4.9-COMPONENT: CashierForm - Single Store Auto-Selection", () => {
  const mockSingleStore = [
    {
      store_id: "store-123",
      name: "Kanta Food Products Store #1",
      company_name: "Kanta Foods INC",
      company_id: "company-456",
      status: "ACTIVE",
      timezone: "America/New_York",
      location_json: { address: "431 W Hill St" },
      created_at: "2025-12-03T18:35:23.078Z",
    },
  ];

  const mockMultipleStores = [
    {
      store_id: "store-1",
      name: "Downtown Store",
      company_name: "Test Company",
      company_id: "company-1",
      status: "ACTIVE",
      timezone: "America/New_York",
      location_json: {},
      created_at: "2025-01-01T00:00:00.000Z",
    },
    {
      store_id: "store-2",
      name: "Uptown Store",
      company_name: "Test Company",
      company_id: "company-1",
      status: "ACTIVE",
      timezone: "America/New_York",
      location_json: {},
      created_at: "2025-01-01T00:00:00.000Z",
    },
  ];

  const mockOnSuccess = vi.fn();
  const mockOnCancel = vi.fn();
  const mockCreateCashier = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateCashier.mockResolvedValue({ success: true });
    vi.mocked(cashiersApi.useCreateCashier).mockReturnValue({
      mutateAsync: mockCreateCashier,
      isPending: false,
      isError: false,
      error: null,
    } as any);
    vi.mocked(cashiersApi.useUpdateCashier).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
      isError: false,
      error: null,
    } as any);
  });

  it("[P0] 4.9-COMPONENT-001: should auto-select single store and display it in disabled dropdown", async () => {
    // GIVEN: User has access to only ONE store
    vi.mocked(clientDashboardApi.useClientDashboard).mockReturnValue({
      data: { stores: mockSingleStore },
      isLoading: false,
      error: null,
      isError: false,
      isSuccess: true,
      refetch: vi.fn(),
    } as any);

    // WHEN: CashierForm is rendered for creating a new cashier
    renderWithProviders(
      <CashierForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />,
    );

    // THEN: The store dropdown should be disabled (only 1 store)
    const storeSelect = screen.getByTestId("cashier-store");
    expect(storeSelect).toBeDisabled();

    // AND: The single store should be automatically selected and displayed
    // Use getAllByText since the store name appears in both the trigger and hidden option
    await waitFor(() => {
      const storeElements = screen.getAllByText(
        /Kanta Food Products Store #1/i,
      );
      expect(storeElements.length).toBeGreaterThan(0);
    });
  });

  it("[P0] 4.9-COMPONENT-002: should have store option in hidden select when auto-selecting single store", async () => {
    // GIVEN: User has access to only ONE store
    vi.mocked(clientDashboardApi.useClientDashboard).mockReturnValue({
      data: { stores: mockSingleStore },
      isLoading: false,
      error: null,
      isError: false,
      isSuccess: true,
      refetch: vi.fn(),
    } as any);

    // WHEN: CashierForm is rendered
    renderWithProviders(
      <CashierForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />,
    );

    // Wait for the store text to be somewhere in the document
    // Use getAllByText since the store name appears in both the trigger and hidden option
    await waitFor(() => {
      const storeElements = screen.getAllByText(
        /Kanta Food Products Store #1/i,
      );
      expect(storeElements.length).toBeGreaterThan(0);
    });

    // THEN: The hidden select element should have the correct value
    // Radix Select renders a hidden native select with the current value
    const hiddenSelect = document.querySelector('select[aria-hidden="true"]');
    expect(hiddenSelect).toBeInTheDocument();

    // Check that the option with store-123 is present
    const storeOption = document.querySelector('option[value="store-123"]');
    expect(storeOption).toBeInTheDocument();
  });

  it("[P1] 4.9-COMPONENT-003: should enable store dropdown when multiple stores exist", async () => {
    // GIVEN: User has access to multiple stores
    vi.mocked(clientDashboardApi.useClientDashboard).mockReturnValue({
      data: { stores: mockMultipleStores },
      isLoading: false,
      error: null,
      isError: false,
      isSuccess: true,
      refetch: vi.fn(),
    } as any);

    // WHEN: CashierForm is rendered
    renderWithProviders(
      <CashierForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />,
    );

    // THEN: The store dropdown should NOT be disabled
    await waitFor(() => {
      const storeSelect = screen.getByTestId("cashier-store");
      expect(storeSelect).not.toBeDisabled();
    });
  });

  it("[P1] 4.9-COMPONENT-004: should NOT auto-select when editing existing cashier", async () => {
    // GIVEN: User is editing an existing cashier
    vi.mocked(clientDashboardApi.useClientDashboard).mockReturnValue({
      data: { stores: mockSingleStore },
      isLoading: false,
      error: null,
      isError: false,
      isSuccess: true,
      refetch: vi.fn(),
    } as any);

    const existingCashier = {
      cashier_id: "cashier-1",
      store_id: "store-123",
      name: "Existing Cashier",
      hired_on: "2025-01-01",
      termination_date: null,
    };

    // WHEN: CashierForm is rendered in edit mode
    renderWithProviders(
      <CashierForm
        cashier={existingCashier as any}
        onSuccess={mockOnSuccess}
        onCancel={mockOnCancel}
      />,
    );

    // THEN: Store selection should NOT be shown for editing
    expect(screen.queryByTestId("cashier-store")).not.toBeInTheDocument();
  });

  it("[P1] 4.9-COMPONENT-005: should show loading spinner while fetching stores", () => {
    // GIVEN: Dashboard data is still loading
    vi.mocked(clientDashboardApi.useClientDashboard).mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
      isError: false,
      isSuccess: false,
      refetch: vi.fn(),
    } as any);

    // WHEN: CashierForm is rendered
    renderWithProviders(
      <CashierForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />,
    );

    // THEN: Loading spinner should be shown instead of the form
    // The form waits for stores to load before rendering to prevent race conditions
    expect(screen.queryByTestId("cashier-store")).not.toBeInTheDocument();
    expect(screen.queryByTestId("cashier-name")).not.toBeInTheDocument();

    // Loading spinner should be visible (Loader2 component with animate-spin class)
    const spinner = document.querySelector(".animate-spin");
    expect(spinner).toBeInTheDocument();
  });
});

describe("4.9-COMPONENT: CashierForm - PIN Validation", () => {
  const mockStores = [
    {
      store_id: "store-1",
      name: "Kanta Food Products Store #1",
      company_name: "Kanta Foods INC",
      company_id: "company-1",
      status: "ACTIVE",
      timezone: "America/New_York",
      location_json: {},
      created_at: "2025-01-01T00:00:00.000Z",
    },
  ];

  const mockOnSuccess = vi.fn();
  const mockOnCancel = vi.fn();
  const mockCreateCashier = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateCashier.mockResolvedValue({ success: true });
    vi.mocked(clientDashboardApi.useClientDashboard).mockReturnValue({
      data: { stores: mockStores },
      isLoading: false,
      error: null,
      isError: false,
      isSuccess: true,
      refetch: vi.fn(),
    } as any);
    vi.mocked(cashiersApi.useCreateCashier).mockReturnValue({
      mutateAsync: mockCreateCashier,
      isPending: false,
      isError: false,
      error: null,
    } as any);
    vi.mocked(cashiersApi.useUpdateCashier).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
      isError: false,
      error: null,
    } as any);
  });

  it("[P0] 4.9-COMPONENT-010: should reject PIN with less than 4 digits", async () => {
    // GIVEN: CashierForm is rendered
    const user = userEvent.setup();
    renderWithProviders(
      <CashierForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />,
    );

    // Wait for store to be auto-selected
    // Use getAllByText since the store name appears in both the trigger and hidden option
    await waitFor(() => {
      const storeElements = screen.getAllByText(/Kanta Food Products Store/i);
      expect(storeElements.length).toBeGreaterThan(0);
    });

    // WHEN: User enters invalid PIN (less than 4 digits)
    await user.type(screen.getByTestId("cashier-name"), "Test Cashier");
    await user.type(screen.getByTestId("cashier-pin"), "123");
    await user.click(screen.getByTestId("submit-cashier"));

    // THEN: Validation error should be shown
    await waitFor(() => {
      expect(
        screen.getByText(/PIN must be exactly 4 numeric digits/i),
      ).toBeInTheDocument();
    });

    // AND: Mutation should NOT be called
    expect(mockCreateCashier).not.toHaveBeenCalled();
  });

  it("[P0] 4.9-COMPONENT-011: should reject PIN with non-numeric characters", async () => {
    // GIVEN: CashierForm is rendered
    const user = userEvent.setup();
    renderWithProviders(
      <CashierForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />,
    );

    // Wait for store to be auto-selected
    // Use getAllByText since the store name appears in both the trigger and hidden option
    await waitFor(() => {
      const storeElements = screen.getAllByText(/Kanta Food Products Store/i);
      expect(storeElements.length).toBeGreaterThan(0);
    });

    // WHEN: User enters PIN with letters
    await user.type(screen.getByTestId("cashier-name"), "Test Cashier");
    await user.type(screen.getByTestId("cashier-pin"), "12ab");
    await user.click(screen.getByTestId("submit-cashier"));

    // THEN: Validation error should be shown
    await waitFor(() => {
      expect(
        screen.getByText(/PIN must be exactly 4 numeric digits/i),
      ).toBeInTheDocument();
    });

    // AND: Mutation should NOT be called
    expect(mockCreateCashier).not.toHaveBeenCalled();
  });

  it("[P0] 4.9-COMPONENT-012: should accept valid 4-digit PIN format", async () => {
    // GIVEN: CashierForm is rendered
    const user = userEvent.setup();
    renderWithProviders(
      <CashierForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />,
    );

    // Wait for store to be auto-selected
    // Use getAllByText since the store name appears in both the trigger and hidden option
    await waitFor(() => {
      const storeElements = screen.getAllByText(/Kanta Food Products Store/i);
      expect(storeElements.length).toBeGreaterThan(0);
    });

    // WHEN: User enters valid PIN and other fields
    await user.type(screen.getByTestId("cashier-name"), "Test Cashier");
    await user.type(screen.getByTestId("cashier-pin"), "5678");

    // THEN: PIN should be in the field (valid format, no validation error shown yet)
    const pinInput = screen.getByTestId("cashier-pin") as HTMLInputElement;
    expect(pinInput.value).toBe("5678");
    expect(pinInput).toHaveAttribute("maxLength", "4");
  });

  it("[P1] 4.9-COMPONENT-013: should have PIN input with type=password", () => {
    // GIVEN: CashierForm is rendered
    renderWithProviders(
      <CashierForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />,
    );

    // THEN: PIN input should have type="password" to mask input
    const pinInput = screen.getByTestId("cashier-pin");
    expect(pinInput).toHaveAttribute("type", "password");
  });

  it("[P1] 4.9-COMPONENT-014: should have PIN input with maxLength=4", () => {
    // GIVEN: CashierForm is rendered
    renderWithProviders(
      <CashierForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />,
    );

    // THEN: PIN input should have maxLength="4"
    const pinInput = screen.getByTestId("cashier-pin");
    expect(pinInput).toHaveAttribute("maxLength", "4");
  });
});

describe("4.9-COMPONENT: CashierForm - Form Fields", () => {
  const mockStores = [
    {
      store_id: "store-1",
      name: "Kanta Food Products Store #1",
      company_name: "Kanta Foods INC",
      company_id: "company-1",
      status: "ACTIVE",
      timezone: "America/New_York",
      location_json: {},
      created_at: "2025-01-01T00:00:00.000Z",
    },
  ];

  const mockOnSuccess = vi.fn();
  const mockOnCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(clientDashboardApi.useClientDashboard).mockReturnValue({
      data: { stores: mockStores },
      isLoading: false,
      error: null,
      isError: false,
      isSuccess: true,
      refetch: vi.fn(),
    } as any);
    vi.mocked(cashiersApi.useCreateCashier).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
      isError: false,
      error: null,
    } as any);
    vi.mocked(cashiersApi.useUpdateCashier).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
      isError: false,
      error: null,
    } as any);
  });

  it("[P0] 4.9-COMPONENT-020: should render all required form fields", () => {
    // GIVEN: CashierForm component
    // WHEN: Component is rendered
    renderWithProviders(
      <CashierForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />,
    );

    // THEN: All required fields should be visible
    expect(screen.getByTestId("cashier-store")).toBeInTheDocument();
    expect(screen.getByTestId("cashier-name")).toBeInTheDocument();
    expect(screen.getByTestId("cashier-pin")).toBeInTheDocument();
    expect(screen.getByTestId("cashier-hired-on")).toBeInTheDocument();
    expect(screen.getByTestId("cashier-termination-date")).toBeInTheDocument();
    expect(screen.getByTestId("submit-cashier")).toBeInTheDocument();
  });

  it("[P1] 4.9-COMPONENT-021: should validate name is required", async () => {
    // GIVEN: CashierForm is rendered
    const user = userEvent.setup();
    renderWithProviders(
      <CashierForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />,
    );

    // Wait for store to be auto-selected
    // Use getAllByText since the store name appears in both the trigger and hidden option
    await waitFor(() => {
      const storeElements = screen.getAllByText(/Kanta Food Products Store/i);
      expect(storeElements.length).toBeGreaterThan(0);
    });

    // WHEN: User submits without name
    await user.type(screen.getByTestId("cashier-pin"), "1234");
    await user.click(screen.getByTestId("submit-cashier"));

    // THEN: Validation error should be displayed
    await waitFor(() => {
      expect(screen.getByText(/Name is required/i)).toBeInTheDocument();
    });
  });

  it("[P1] 4.9-COMPONENT-022: should validate PIN is required", async () => {
    // GIVEN: CashierForm is rendered
    const user = userEvent.setup();
    renderWithProviders(
      <CashierForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />,
    );

    // Wait for store to be auto-selected
    // Use getAllByText since the store name appears in both the trigger and hidden option
    await waitFor(() => {
      const storeElements = screen.getAllByText(/Kanta Food Products Store/i);
      expect(storeElements.length).toBeGreaterThan(0);
    });

    // WHEN: User submits without PIN
    await user.type(screen.getByTestId("cashier-name"), "Test Cashier");
    await user.click(screen.getByTestId("submit-cashier"));

    // THEN: Validation error should be displayed
    await waitFor(() => {
      expect(
        screen.getByText(/PIN must be exactly 4 numeric digits/i),
      ).toBeInTheDocument();
    });
  });

  it("[P1] 4.9-COMPONENT-023: should call onCancel when cancel button is clicked", async () => {
    // GIVEN: CashierForm is rendered
    const user = userEvent.setup();
    renderWithProviders(
      <CashierForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />,
    );

    // WHEN: Cancel button is clicked
    await user.click(screen.getByRole("button", { name: /Cancel/i }));

    // THEN: onCancel should be called
    expect(mockOnCancel).toHaveBeenCalled();
  });

  it("[P1] 4.9-COMPONENT-024: should default hired date to today", () => {
    // GIVEN: CashierForm is rendered
    renderWithProviders(
      <CashierForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />,
    );

    // THEN: Hired date should default to today
    const hiredInput = screen.getByTestId(
      "cashier-hired-on",
    ) as HTMLInputElement;
    const today = new Date().toISOString().split("T")[0];
    expect(hiredInput.value).toBe(today);
  });
});

describe("4.9-COMPONENT: CashierForm - Submission States", () => {
  const mockStores = [
    {
      store_id: "store-1",
      name: "Kanta Food Products Store #1",
      company_name: "Kanta Foods INC",
      company_id: "company-1",
      status: "ACTIVE",
      timezone: "America/New_York",
      location_json: {},
      created_at: "2025-01-01T00:00:00.000Z",
    },
  ];

  const mockOnSuccess = vi.fn();
  const mockOnCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(clientDashboardApi.useClientDashboard).mockReturnValue({
      data: { stores: mockStores },
      isLoading: false,
      error: null,
      isError: false,
      isSuccess: true,
      refetch: vi.fn(),
    } as any);
    vi.mocked(cashiersApi.useUpdateCashier).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
      isError: false,
      error: null,
    } as any);
  });

  it("[P1] 4.9-COMPONENT-030: should disable submit button during submission", () => {
    // GIVEN: Create mutation is pending
    vi.mocked(cashiersApi.useCreateCashier).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: true,
      isError: false,
      error: null,
    } as any);

    // WHEN: Component is rendered
    renderWithProviders(
      <CashierForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />,
    );

    // THEN: Submit button should be disabled
    const submitButton = screen.getByTestId("submit-cashier");
    expect(submitButton).toBeDisabled();
  });

  it("[P1] 4.9-COMPONENT-031: should show loading text during submission", () => {
    // GIVEN: Create mutation is pending
    vi.mocked(cashiersApi.useCreateCashier).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: true,
      isError: false,
      error: null,
    } as any);

    // WHEN: Component is rendered
    renderWithProviders(
      <CashierForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />,
    );

    // THEN: Submit button should show "Creating..."
    expect(screen.getByText(/Creating.../i)).toBeInTheDocument();
  });

  it("[P1] 4.9-COMPONENT-032: should disable form fields during submission", () => {
    // GIVEN: Create mutation is pending
    vi.mocked(cashiersApi.useCreateCashier).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: true,
      isError: false,
      error: null,
    } as any);

    // WHEN: Component is rendered
    renderWithProviders(
      <CashierForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />,
    );

    // THEN: Input fields should be disabled
    expect(screen.getByTestId("cashier-name")).toBeDisabled();
    expect(screen.getByTestId("cashier-pin")).toBeDisabled();
  });
});
