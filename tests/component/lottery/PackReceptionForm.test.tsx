/**
 * Component Tests: PackReceptionForm
 *
 * Tests PackReceptionForm component behavior:
 * - Form field rendering and validation
 * - Form submission with API integration
 * - Success/error message display
 * - List refresh after submission
 *
 * @test-level COMPONENT
 * @justification Tests UI form behavior in isolation - fast, isolated, granular
 * @story 6-10 - Lottery Management UI
 * @priority P1 (High - Pack Reception)
 *
 * RED PHASE: These tests define expected behavior before implementation.
 * Tests will fail until component is implemented.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PackReceptionForm } from "@/components/lottery/PackReceptionForm";

// Mock Next.js navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

// Mock API client
vi.mock("@/lib/api/lottery", () => ({
  receivePack: vi.fn(),
}));

describe("6.10-COMPONENT: PackReceptionForm", () => {
  const mockOnSuccess = vi.fn();
  const mockOnCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("6.10-COMPONENT-010: [P1] should render form fields (AC #2)", async () => {
    // GIVEN: PackReceptionForm component
    // WHEN: Component is rendered
    render(
      <PackReceptionForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />,
    );

    // THEN: All form fields are displayed
    expect(screen.getByLabelText(/game/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/pack number/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/serial start/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/serial end/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/bin/i)).toBeInTheDocument();
  });

  it("6.10-COMPONENT-011: [P1] should validate required fields (AC #2)", async () => {
    // GIVEN: PackReceptionForm component
    const user = userEvent.setup();
    render(
      <PackReceptionForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />,
    );

    // WHEN: User submits form without filling required fields
    const submitButton = screen.getByRole("button", {
      name: /submit|receive|create/i,
    });
    await user.click(submitButton);

    // THEN: Validation errors are displayed
    await waitFor(() => {
      expect(screen.getByText(/game.*required/i)).toBeInTheDocument();
      expect(screen.getByText(/pack number.*required/i)).toBeInTheDocument();
    });
  });

  it("6.10-COMPONENT-012: [P1] should validate serial range (AC #2)", async () => {
    // GIVEN: PackReceptionForm component with invalid serial range
    const user = userEvent.setup();
    render(
      <PackReceptionForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />,
    );

    // WHEN: User enters serial_start > serial_end
    await user.type(screen.getByLabelText(/serial start/i), "0100");
    await user.type(screen.getByLabelText(/serial end/i), "0001");
    const submitButton = screen.getByRole("button", {
      name: /submit|receive|create/i,
    });
    await user.click(submitButton);

    // THEN: Serial range validation error is displayed
    await waitFor(() => {
      expect(screen.getByText(/serial.*range|start.*end/i)).toBeInTheDocument();
    });
  });

  it("6.10-COMPONENT-013: [P1] should submit form with valid data (AC #2)", async () => {
    // GIVEN: PackReceptionForm component with valid data
    const user = userEvent.setup();
    const { receivePack } = await import("@/lib/api/lottery");
    vi.mocked(receivePack).mockResolvedValue({
      success: true,
      data: {
        pack_id: "123e4567-e89b-12d3-a456-426614174000",
        status: "RECEIVED",
      },
    });

    render(
      <PackReceptionForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />,
    );

    // WHEN: User fills form and submits
    await user.type(screen.getByLabelText(/pack number/i), "PACK-001");
    await user.type(screen.getByLabelText(/serial start/i), "0001");
    await user.type(screen.getByLabelText(/serial end/i), "0100");
    // Select game (assuming dropdown or input)
    const submitButton = screen.getByRole("button", {
      name: /submit|receive|create/i,
    });
    await user.click(submitButton);

    // THEN: API is called and success callback is invoked
    await waitFor(() => {
      expect(receivePack).toHaveBeenCalled();
      expect(mockOnSuccess).toHaveBeenCalled();
    });
  });

  it("6.10-COMPONENT-014: [P1] should display success message after submission (AC #2)", async () => {
    // GIVEN: PackReceptionForm component
    const user = userEvent.setup();
    const { receivePack } = await import("@/lib/api/lottery");
    vi.mocked(receivePack).mockResolvedValue({
      success: true,
      data: {
        pack_id: "123e4567-e89b-12d3-a456-426614174000",
        status: "RECEIVED",
      },
    });

    render(
      <PackReceptionForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />,
    );

    // WHEN: User submits valid form
    await user.type(screen.getByLabelText(/pack number/i), "PACK-001");
    await user.type(screen.getByLabelText(/serial start/i), "0001");
    await user.type(screen.getByLabelText(/serial end/i), "0100");
    const submitButton = screen.getByRole("button", {
      name: /submit|receive|create/i,
    });
    await user.click(submitButton);

    // THEN: Success message is displayed
    await waitFor(() => {
      expect(
        screen.getByText(/success|pack.*received|created/i),
      ).toBeInTheDocument();
    });
  });

  it("6.10-COMPONENT-015: [P1] should display error message on API failure (AC #2)", async () => {
    // GIVEN: PackReceptionForm component with API error
    const user = userEvent.setup();
    const { receivePack } = await import("@/lib/api/lottery");
    vi.mocked(receivePack).mockRejectedValue(new Error("API Error"));

    render(
      <PackReceptionForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />,
    );

    // WHEN: User submits form
    await user.type(screen.getByLabelText(/pack number/i), "PACK-001");
    await user.type(screen.getByLabelText(/serial start/i), "0001");
    await user.type(screen.getByLabelText(/serial end/i), "0100");
    const submitButton = screen.getByRole("button", {
      name: /submit|receive|create/i,
    });
    await user.click(submitButton);

    // THEN: Error message is displayed
    await waitFor(() => {
      expect(screen.getByText(/error|failed/i)).toBeInTheDocument();
    });
  });

  it("6.10-COMPONENT-016: [P1] should show loading state during submission (AC #2)", async () => {
    // GIVEN: PackReceptionForm component with slow API
    const user = userEvent.setup();
    const { receivePack } = await import("@/lib/api/lottery");
    vi.mocked(receivePack).mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve({ success: true, data: {} }), 100),
        ),
    );

    render(
      <PackReceptionForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />,
    );

    // WHEN: User submits form
    await user.type(screen.getByLabelText(/pack number/i), "PACK-001");
    await user.type(screen.getByLabelText(/serial start/i), "0001");
    await user.type(screen.getByLabelText(/serial end/i), "0100");
    const submitButton = screen.getByRole("button", {
      name: /submit|receive|create/i,
    });
    await user.click(submitButton);

    // THEN: Loading state is shown (button disabled or spinner)
    expect(submitButton).toBeDisabled();
  });
});
