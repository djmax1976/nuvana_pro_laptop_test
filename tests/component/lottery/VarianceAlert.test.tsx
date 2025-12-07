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
 *
 * RED PHASE: These tests define expected behavior before implementation.
 * Tests will fail until component is implemented.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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

    // THEN: Variance details are displayed (expected, actual, difference, pack)
    expect(screen.getByText(/100|expected/i)).toBeInTheDocument();
    expect(screen.getByText(/95|actual/i)).toBeInTheDocument();
    expect(screen.getByText(/-5|difference/i)).toBeInTheDocument();
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
    expect(screen.getByText(/shift1|shift.*1/i)).toBeInTheDocument();
    expect(screen.getByText(/shift2|shift.*2/i)).toBeInTheDocument();
  });

  it("6.10-COMPONENT-043: [P1] should highlight unresolved variances (AC #5)", async () => {
    // GIVEN: VarianceAlert component with unresolved variances
    // WHEN: Component is rendered
    render(<VarianceAlert variances={mockVariances} />);

    // THEN: Unresolved variances are highlighted (red/orange color)
    const unresolvedAlert = screen.getByRole("alert", {
      name: /variance|discrepancy/i,
    });
    expect(unresolvedAlert).toHaveClass(
      /red|orange|bg-red|bg-orange|text-red|text-orange/,
    );
  });

  it("6.10-COMPONENT-044: [P1] should not highlight resolved variances (AC #5)", async () => {
    // GIVEN: VarianceAlert component with resolved variance
    const resolvedVariance = [
      {
        ...mockVariances[0],
        approved_at: "2024-01-01T12:00:00Z",
      },
    ];
    // WHEN: Component is rendered
    render(<VarianceAlert variances={resolvedVariance} />);

    // THEN: Resolved variance is not highlighted (gray or normal color)
    const resolvedAlert = screen.getByRole("alert", {
      name: /variance|discrepancy/i,
    });
    expect(resolvedAlert).not.toHaveClass(/red|orange|bg-red|bg-orange/);
  });

  it("6.10-COMPONENT-045: [P1] should display message when no variances exist (AC #5)", async () => {
    // GIVEN: VarianceAlert component with no variances
    // WHEN: Component is rendered
    render(<VarianceAlert variances={[]} />);

    // THEN: Message indicating no variances is displayed
    expect(screen.getByText(/no.*variance|all.*clear/i)).toBeInTheDocument();
  });
});
