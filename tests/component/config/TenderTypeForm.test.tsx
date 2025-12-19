import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders, screen, waitFor } from "../../support/test-utils";
import { TenderTypeForm } from "@/components/config/TenderTypeForm";
import userEvent from "@testing-library/user-event";
import * as tenderTypesApi from "@/lib/api/tender-types";

/**
 * @test-level Component
 * @justification UI component tests for TenderTypeForm - tests form rendering, validation, and submission
 * @story Phase 6.1 - Tender Type Management UI
 *
 * Component Tests: TenderTypeForm
 *
 * CRITICAL TEST COVERAGE:
 * - Create mode renders empty form
 * - Edit mode populates form with existing data
 * - Form validation (code format, required fields)
 * - Submit creates/updates tender type
 * - Cancel navigates back
 */

// Mock the API hooks
vi.mock("@/lib/api/tender-types", () => ({
  useTenderType: vi.fn(),
  useCreateTenderType: vi.fn(() => ({
    mutateAsync: vi.fn(),
    isPending: false,
  })),
  useUpdateTenderType: vi.fn(() => ({
    mutateAsync: vi.fn(),
    isPending: false,
  })),
}));

// Mock the toast hook
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

// Mock next/navigation
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    back: vi.fn(),
  }),
}));

describe("Phase 6.1-COMPONENT: TenderTypeForm - Create Mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should render empty form in create mode", () => {
    renderWithProviders(<TenderTypeForm mode="create" />);

    expect(screen.getByText(/create tender type/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/code/i)).toHaveValue("");
    expect(screen.getByLabelText(/name/i)).toHaveValue("");
  });

  it("should display required field indicators", () => {
    renderWithProviders(<TenderTypeForm mode="create" />);

    // The form should have labels for required fields
    expect(screen.getByLabelText(/code/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
  });

  it("should validate code format (uppercase letters and underscores)", async () => {
    const user = userEvent.setup();
    renderWithProviders(<TenderTypeForm mode="create" />);

    const codeInput = screen.getByLabelText(/code/i);
    await user.type(codeInput, "invalid-code");

    const submitButton = screen.getByRole("button", { name: /create|save/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/uppercase letters/i)).toBeInTheDocument();
    });
  });

  it("should submit form with valid data", async () => {
    const mockCreate = vi.fn().mockResolvedValue({});
    vi.mocked(tenderTypesApi.useCreateTenderType).mockReturnValue({
      mutateAsync: mockCreate,
      isPending: false,
    } as ReturnType<typeof tenderTypesApi.useCreateTenderType>);

    const user = userEvent.setup();
    renderWithProviders(<TenderTypeForm mode="create" />);

    await user.type(screen.getByLabelText(/code/i), "DEBIT");
    await user.type(screen.getByLabelText(/name/i), "Debit Card");
    await user.type(
      screen.getByLabelText(/description/i),
      "Debit card payments",
    );

    const submitButton = screen.getByRole("button", { name: /create|save/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          code: "DEBIT",
          name: "Debit Card",
          description: "Debit card payments",
        }),
      );
    });
  });

  it("should navigate back on cancel", async () => {
    const user = userEvent.setup();
    renderWithProviders(<TenderTypeForm mode="create" />);

    const cancelButton = screen.getByRole("button", { name: /cancel/i });
    await user.click(cancelButton);

    expect(mockPush).toHaveBeenCalledWith(
      "/client-dashboard/config/tender-types",
    );
  });
});

describe("Phase 6.1-COMPONENT: TenderTypeForm - Edit Mode", () => {
  const mockTenderType = {
    tender_type_id: "tt-1",
    code: "CASH",
    name: "Cash",
    description: "Cash payments",
    is_cash: true,
    requires_reference: false,
    is_active: true,
    display_order: 1,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should load and display existing tender type data", async () => {
    vi.mocked(tenderTypesApi.useTenderType).mockReturnValue({
      data: { data: mockTenderType },
      isLoading: false,
      error: null,
    } as ReturnType<typeof tenderTypesApi.useTenderType>);

    renderWithProviders(<TenderTypeForm mode="edit" tenderTypeId="tt-1" />);

    await waitFor(() => {
      expect(screen.getByLabelText(/code/i)).toHaveValue("CASH");
      expect(screen.getByLabelText(/name/i)).toHaveValue("Cash");
      expect(screen.getByLabelText(/description/i)).toHaveValue(
        "Cash payments",
      );
    });
  });

  it("should display edit title", async () => {
    vi.mocked(tenderTypesApi.useTenderType).mockReturnValue({
      data: { data: mockTenderType },
      isLoading: false,
      error: null,
    } as ReturnType<typeof tenderTypesApi.useTenderType>);

    renderWithProviders(<TenderTypeForm mode="edit" tenderTypeId="tt-1" />);

    await waitFor(() => {
      expect(screen.getByText(/edit tender type/i)).toBeInTheDocument();
    });
  });

  it("should submit updated data", async () => {
    vi.mocked(tenderTypesApi.useTenderType).mockReturnValue({
      data: { data: mockTenderType },
      isLoading: false,
      error: null,
    } as ReturnType<typeof tenderTypesApi.useTenderType>);

    const mockUpdate = vi.fn().mockResolvedValue({});
    vi.mocked(tenderTypesApi.useUpdateTenderType).mockReturnValue({
      mutateAsync: mockUpdate,
      isPending: false,
    } as ReturnType<typeof tenderTypesApi.useUpdateTenderType>);

    const user = userEvent.setup();
    renderWithProviders(<TenderTypeForm mode="edit" tenderTypeId="tt-1" />);

    await waitFor(() => {
      expect(screen.getByLabelText(/name/i)).toHaveValue("Cash");
    });

    const nameInput = screen.getByLabelText(/name/i);
    await user.clear(nameInput);
    await user.type(nameInput, "Cash Payment");

    const submitButton = screen.getByRole("button", { name: /save|update/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          tenderTypeId: "tt-1",
          name: "Cash Payment",
        }),
      );
    });
  });

  it("should show loading state while fetching", () => {
    vi.mocked(tenderTypesApi.useTenderType).mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as ReturnType<typeof tenderTypesApi.useTenderType>);

    renderWithProviders(<TenderTypeForm mode="edit" tenderTypeId="tt-1" />);

    const skeletons = document.querySelectorAll('[class*="animate-pulse"]');
    expect(skeletons.length).toBeGreaterThan(0);
  });
});
