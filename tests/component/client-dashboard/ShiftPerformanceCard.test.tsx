/**
 * @test-level Component
 * @justification Tests for ShiftPerformanceCard with donut chart
 * @story Client Owner Dashboard - Shift Performance
 *
 * ShiftPerformanceCard Component Tests
 *
 * CRITICAL TEST COVERAGE:
 * - Donut chart rendering
 * - View selector functionality
 * - Quick stats display
 * - Accessibility
 *
 * Requirements Traceability Matrix:
 * ┌─────────────────────────────────────────────────────────────────┐
 * │ Test ID                    │ Requirement         │ Priority    │
 * ├─────────────────────────────────────────────────────────────────┤
 * │ SHIFT-001                  │ Render chart        │ P0          │
 * │ SHIFT-002                  │ Goal percentage     │ P0          │
 * │ SHIFT-003                  │ View selector       │ P0          │
 * │ SHIFT-004                  │ Quick stats         │ P1          │
 * │ SHIFT-005                  │ Accessibility       │ P0          │
 * └─────────────────────────────────────────────────────────────────┘
 */

import { describe, it, expect, vi } from "vitest";
import { renderWithProviders, screen, waitFor } from "../../support/test-utils";
import userEvent from "@testing-library/user-event";
import {
  ShiftPerformanceCard,
  ShiftPerformanceCardSkeleton,
} from "@/components/client-dashboard/shift-performance-card";

// Mock Recharts
vi.mock("recharts", () => ({
  PieChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="mock-pie-chart">{children}</div>
  ),
  Pie: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="mock-pie">{children}</div>
  ),
  Cell: () => <div data-testid="mock-cell" />,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="mock-responsive-container">{children}</div>
  ),
}));

describe("CLIENT-DASHBOARD: ShiftPerformanceCard Component", () => {
  // ============================================
  // RENDERING TESTS
  // ============================================
  describe("Rendering", () => {
    it("[P0] SHIFT-001: should render title and donut chart", () => {
      // GIVEN: ShiftPerformanceCard
      renderWithProviders(<ShiftPerformanceCard />);

      // THEN: Title and chart are displayed
      expect(screen.getByText("Shift Performance")).toBeInTheDocument();
      expect(screen.getByTestId("mock-pie-chart")).toBeInTheDocument();
    });

    it("[P0] SHIFT-002: should display goal percentage", () => {
      // GIVEN: ShiftPerformanceCard with default data (71%)
      renderWithProviders(<ShiftPerformanceCard />);

      // THEN: Goal percentage is displayed
      expect(screen.getByText("71%")).toBeInTheDocument();
      expect(screen.getByText("of Goal")).toBeInTheDocument();
    });

    it("[P0] SHIFT-002b: should display custom goal percentage", () => {
      // GIVEN: ShiftPerformanceCard with custom data
      renderWithProviders(
        <ShiftPerformanceCard
          initialData={{
            goalPercent: 85,
            transactions: 100,
            avgTicket: 30.0,
            paceCompare: { percent: 20, label: "ahead vs last month" },
          }}
        />,
      );

      // THEN: Custom goal percentage is displayed
      expect(screen.getByText("85%")).toBeInTheDocument();
    });

    it("[P1] SHIFT-004: should display quick stats", () => {
      // GIVEN: ShiftPerformanceCard with default data
      renderWithProviders(<ShiftPerformanceCard />);

      // THEN: Quick stats are displayed
      expect(screen.getByText("86")).toBeInTheDocument(); // Transactions
      expect(screen.getByText("Transactions")).toBeInTheDocument();
      expect(screen.getByText("$24.95")).toBeInTheDocument(); // Avg Ticket
      expect(screen.getByText("Avg. Ticket")).toBeInTheDocument();
    });

    it("[P1] SHIFT-004b: should display pace comparison", () => {
      // GIVEN: ShiftPerformanceCard
      renderWithProviders(<ShiftPerformanceCard />);

      // THEN: Pace comparison is displayed
      expect(screen.getByText("+18%")).toBeInTheDocument();
      expect(screen.getByText(/ahead of pace/)).toBeInTheDocument();
    });
  });

  // ============================================
  // VIEW SELECTOR TESTS
  // ============================================
  describe("View Selector", () => {
    it("[P0] SHIFT-003: should render view selector", () => {
      // GIVEN: ShiftPerformanceCard
      renderWithProviders(<ShiftPerformanceCard />);

      // THEN: View selector is present
      const viewSelector = screen.getByTestId("shift-view-select");
      expect(viewSelector).toBeInTheDocument();
    });

    it("[P0] SHIFT-003b: should call onViewChange when view changes", async () => {
      // GIVEN: ShiftPerformanceCard with callback
      const onViewChange = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(<ShiftPerformanceCard onViewChange={onViewChange} />);

      // WHEN: User clicks on the view selector
      const viewTrigger = screen.getByTestId("shift-view-select");
      await user.click(viewTrigger);

      // AND: Selects "Today" option
      const todayOption = await screen.findByText("Today");
      await user.click(todayOption);

      // THEN: Callback is invoked
      await waitFor(() => {
        expect(onViewChange).toHaveBeenCalledWith("today");
      });
    });

    it("[P1] SHIFT-003c: should update data when view changes", async () => {
      // GIVEN: ShiftPerformanceCard
      const user = userEvent.setup();
      renderWithProviders(<ShiftPerformanceCard />);

      // Initial state
      expect(screen.getByText("71%")).toBeInTheDocument();

      // WHEN: User changes view to "Today"
      const viewTrigger = screen.getByTestId("shift-view-select");
      await user.click(viewTrigger);

      const todayOption = await screen.findByText("Today");
      await user.click(todayOption);

      // THEN: Data updates (Today view shows 85%)
      await waitFor(() => {
        expect(screen.getByText("85%")).toBeInTheDocument();
      });
    });
  });

  // ============================================
  // ACCESSIBILITY TESTS
  // ============================================
  describe("Accessibility", () => {
    it("[P0] SHIFT-005: should have correct ARIA attributes", () => {
      // GIVEN: ShiftPerformanceCard
      renderWithProviders(<ShiftPerformanceCard />);

      // THEN: ARIA attributes are correct
      const card = screen.getByTestId("shift-performance-card");
      expect(card).toHaveAttribute("role", "region");
      expect(card).toHaveAttribute(
        "aria-labelledby",
        "shift-performance-title",
      );
    });

    it("[P0] SHIFT-005b: should have accessible view selector", () => {
      // GIVEN: ShiftPerformanceCard
      renderWithProviders(<ShiftPerformanceCard />);

      // THEN: View selector has proper label
      expect(
        screen.getByLabelText("Select performance view"),
      ).toBeInTheDocument();
    });
  });

  // ============================================
  // SKELETON TESTS
  // ============================================
  describe("ShiftPerformanceCardSkeleton", () => {
    it("[P1] SHIFT-006: should render loading skeleton", () => {
      // GIVEN: ShiftPerformanceCardSkeleton
      renderWithProviders(<ShiftPerformanceCardSkeleton />);

      // THEN: Skeleton has animation class
      const skeleton = document.querySelector(".animate-pulse");
      expect(skeleton).toBeInTheDocument();
    });
  });
});
