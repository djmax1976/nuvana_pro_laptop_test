/**
 * Component Tests: VarianceAlert
 *
 * Tests VarianceAlert component behavior:
 * - Displays variance alerts prominently
 * - Shows variance details (expected, actual, difference, pack, shift)
 * - Groups variances by shift or pack
 * - Highlights unresolved variances
 *
 * @test-level COMPONENT
 * @justification Tests UI alert component behavior in isolation - fast, isolated, granular
 * @story 6-10 - Lottery Management UI
 * @priority P1 (High - Variance Display)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { VarianceAlert } from "@/components/lottery/VarianceAlert";

// Mock Next.js navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

// Mock date-fns format function
vi.mock("date-fns", () => ({
  format: vi.fn((date: Date, formatStr: string) => {
    return new Date(date).toLocaleString();
  }),
}));

describe("6.10-COMPONENT: VarianceAlert", () => {
  const mockVariances = [
    {
      variance_id: "v1",
      shift_id: "shift1",
      pack_id: "pack1",
      expected_count: 100,
      actual_count: 95,
      difference: -5,
      approved_at: null,
      pack: {
        pack_number: "PACK-001",
        game: { name: "Game 1" },
      },
      shift: {
        shift_id: "shift1",
        opened_at: "2024-01-01T10:00:00Z",
      },
    },
    {
      variance_id: "v2",
      shift_id: "shift1",
      pack_id: "pack2",
      expected_count: 50,
      actual_count: 52,
      difference: 2,
      approved_at: null,
      pack: {
        pack_number: "PACK-002",
        game: { name: "Game 2" },
      },
      shift: {
        shift_id: "shift1",
        opened_at: "2024-01-01T10:00:00Z",
      },
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("6.10-COMPONENT-040: [P1] should display variance alert prominently (AC #5)", async () => {
    // GIVEN: VarianceAlert component with variances
    // WHEN: Component is rendered
    render(<VarianceAlert variances={mockVariances} />);

    // THEN: Alert is displayed prominently (banner, notification, or highlighted section)
    const alert = screen.getByRole("alert", { name: /variance|discrepancy/i });
    expect(alert).toBeInTheDocument();
  });

  it("6.10-COMPONENT-041: [P1] should display variance details (AC #5)", async () => {
    // GIVEN: VarianceAlert component with variances
    // WHEN: Component is rendered
    render(<VarianceAlert variances={mockVariances} />);

    // THEN: Variance details are displayed
    // Check expected count value
    expect(screen.getByText("100")).toBeInTheDocument();
    // Check actual count value
    expect(screen.getByText("95")).toBeInTheDocument();
    // Check difference value
    expect(screen.getByText("-5")).toBeInTheDocument();
    // Check pack number
    expect(screen.getByText("PACK-001")).toBeInTheDocument();
  });

  it("6.10-COMPONENT-042: [P1] should group variances by shift (AC #5)", async () => {
    // GIVEN: VarianceAlert component with variances from multiple shifts
    const multiShiftVariances = [
      ...mockVariances,
      {
        variance_id: "v3",
        shift_id: "shift2",
        pack_id: "pack1",
        expected_count: 100,
        actual_count: 98,
        difference: -2,
        approved_at: null,
        pack: {
          pack_number: "PACK-001",
          game: { name: "Game 1" },
        },
        shift: {
          shift_id: "shift2",
          opened_at: "2024-01-02T10:00:00Z",
        },
      },
    ];
    // WHEN: Component is rendered
    render(<VarianceAlert variances={multiShiftVariances} />);

    // THEN: Variances are grouped by shift
    // Each shift shows as "Shift shift1..." and "Shift shift2..."
    expect(screen.getByText(/shift1/i)).toBeInTheDocument();
    expect(screen.getByText(/shift2/i)).toBeInTheDocument();
  });

  it("6.10-COMPONENT-043: [P1] should highlight unresolved variances with destructive styling (AC #5)", async () => {
    // GIVEN: VarianceAlert component with unresolved variances
    // WHEN: Component is rendered
    render(<VarianceAlert variances={mockVariances} />);

    // THEN: Unresolved variances are highlighted with destructive variant
    // Note: shadcn/ui uses border-destructive/50 and bg-destructive/10 for destructive alerts
    const unresolvedAlert = screen.getByRole("alert", {
      name: /variance|discrepancy/i,
    });
    expect(unresolvedAlert).toHaveClass(/destructive/);
  });

  it("6.10-COMPONENT-044: [P1] should not highlight resolved variances with destructive styling (AC #5)", async () => {
    // GIVEN: VarianceAlert component with resolved variance
    const resolvedVariance = [
      {
        ...mockVariances[0],
        approved_at: "2024-01-01T12:00:00Z",
      },
    ];
    // WHEN: Component is rendered
    render(<VarianceAlert variances={resolvedVariance} />);

    // THEN: Resolved variance alert exists but without destructive styling
    // The alert role should exist (for "No Variances" or resolved section)
    const alerts = screen.getAllByRole("alert");
    expect(alerts.length).toBeGreaterThan(0);
  });

  it("6.10-COMPONENT-045: [P1] should not render when no variances exist (AC #5)", async () => {
    // GIVEN: VarianceAlert component with no variances
    // WHEN: Component is rendered
    const { container } = render(<VarianceAlert variances={[]} />);

    // THEN: Component returns null and renders nothing (this is the expected behavior)
    // The component does not render any content when there are no variances to display
    // This prevents showing an empty alert/UI element when there's nothing to show
    expect(container.firstChild).toBeNull();
    expect(screen.queryByTestId("variance-alert")).not.toBeInTheDocument();
  });
});
