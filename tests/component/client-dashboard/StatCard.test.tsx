/**
 * @test-level Component
 * @justification Tests for StatCard KPI component with trend charts
 * @story Client Owner Dashboard - KPI Cards
 *
 * StatCard Component Tests
 *
 * CRITICAL TEST COVERAGE:
 * - Rendering with all prop combinations
 * - Trend indicators (positive/negative/balanced)
 * - Chart data validation
 * - Accessibility (ARIA labels, roles)
 * - Edge cases (empty data, invalid values)
 *
 * Requirements Traceability Matrix:
 * ┌─────────────────────────────────────────────────────────────────┐
 * │ Test ID                    │ Requirement         │ Priority    │
 * ├─────────────────────────────────────────────────────────────────┤
 * │ STAT-001                   │ Display KPI value   │ P0          │
 * │ STAT-002                   │ Display trend       │ P0          │
 * │ STAT-003                   │ Display icon        │ P1          │
 * │ STAT-004                   │ Render chart        │ P1          │
 * │ STAT-005                   │ Accessibility       │ P0          │
 * │ STAT-006                   │ Edge cases          │ P1          │
 * │ STAT-007                   │ Security (XSS)      │ P0          │
 * └─────────────────────────────────────────────────────────────────┘
 */

import { describe, it, expect, vi } from "vitest";
import { renderWithProviders, screen, within } from "../../support/test-utils";
import {
  StatCard,
  StatCardSkeleton,
  type ChartDataPoint,
} from "@/components/client-dashboard/stat-card";

// Mock Recharts to avoid canvas issues in jsdom
vi.mock("recharts", () => ({
  AreaChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="mock-area-chart">{children}</div>
  ),
  Area: () => <div data-testid="mock-area" />,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="mock-responsive-container">{children}</div>
  ),
  Tooltip: () => <div data-testid="mock-tooltip" />,
  XAxis: () => <div data-testid="mock-xaxis" />,
  YAxis: () => <div data-testid="mock-yaxis" />,
}));

describe("CLIENT-DASHBOARD: StatCard Component", () => {
  // ============================================
  // RENDERING TESTS
  // ============================================
  describe("Rendering", () => {
    it("[P0] STAT-001: should render KPI value and label", () => {
      // GIVEN: StatCard with value and label
      renderWithProviders(
        <StatCard
          id="test-card"
          label="Test Metric"
          value="$1,234"
          icon="receipt"
        />,
      );

      // THEN: Value and label are displayed
      expect(screen.getByText("$1,234")).toBeInTheDocument();
      expect(screen.getByText("Test Metric")).toBeInTheDocument();
    });

    it("[P0] STAT-002: should render positive trend indicator", () => {
      // GIVEN: StatCard with positive trend
      renderWithProviders(
        <StatCard
          id="test-card"
          label="Sales"
          value="$5,000"
          trend={{ value: "+12.5%", isPositive: true }}
          icon="receipt"
        />,
      );

      // THEN: Positive trend is displayed with correct styling
      const trendElement = screen.getByText("+12.5%");
      expect(trendElement).toBeInTheDocument();
      // The text is inside a nested span, the parent span has the color class
      const parentSpan = trendElement.parentElement;
      expect(parentSpan).toHaveClass("text-green-600");
    });

    it("[P0] STAT-002b: should render negative trend indicator", () => {
      // GIVEN: StatCard with negative trend
      renderWithProviders(
        <StatCard
          id="test-card"
          label="Variance"
          value="-$50"
          trend={{ value: "-2.5%", isPositive: false }}
          icon="wallet"
        />,
      );

      // THEN: Negative trend is displayed with correct styling
      const trendElement = screen.getByText("-2.5%");
      expect(trendElement).toBeInTheDocument();
      // The text is inside a nested span, the parent span has the color class
      const parentSpan = trendElement.parentElement;
      expect(parentSpan).toHaveClass("text-red-500");
    });

    it("[P1] STAT-002c: should render custom trend label", () => {
      // GIVEN: StatCard with custom trend label
      renderWithProviders(
        <StatCard
          id="test-card"
          label="Lottery Variance"
          value="$0"
          trend={{ value: "balanced", isPositive: true, label: "balanced" }}
          icon="scale"
        />,
      );

      // THEN: Custom label is displayed
      expect(screen.getByText("balanced")).toBeInTheDocument();
    });

    it("[P1] STAT-003: should render icon with correct variant", () => {
      // GIVEN: StatCard with different icon variants
      const { rerender } = renderWithProviders(
        <StatCard
          id="test-primary"
          label="Primary"
          value="$100"
          icon="receipt"
          iconVariant="primary"
        />,
      );

      // THEN: Icon container has correct variant class
      const card = screen.getByTestId("stat-card-test-primary");
      const iconContainer = card.querySelector("[aria-hidden='true']");
      expect(iconContainer).toHaveClass("bg-primary/10", "text-primary");

      // Rerender with secondary variant
      rerender(
        <StatCard
          id="test-secondary"
          label="Secondary"
          value="$200"
          icon="fuel"
          iconVariant="secondary"
        />,
      );

      const card2 = screen.getByTestId("stat-card-test-secondary");
      const iconContainer2 = card2.querySelector("[aria-hidden='true']");
      expect(iconContainer2).toHaveClass("bg-green-500/10", "text-green-600");
    });

    it("[P1] STAT-004: should render chart when data provided", () => {
      // GIVEN: StatCard with chart data
      const chartData: ChartDataPoint[] = [
        { value: 100 },
        { value: 150 },
        { value: 120 },
      ];

      renderWithProviders(
        <StatCard
          id="test-chart"
          label="With Chart"
          value="$120"
          icon="receipt"
          chartData={chartData}
        />,
      );

      // THEN: Chart components are rendered
      expect(
        screen.getByTestId("mock-responsive-container"),
      ).toBeInTheDocument();
      expect(screen.getByTestId("mock-area-chart")).toBeInTheDocument();
    });

    it("[P1] STAT-004b: should not render chart when no data provided", () => {
      // GIVEN: StatCard without chart data
      renderWithProviders(
        <StatCard
          id="test-no-chart"
          label="No Chart"
          value="$0"
          icon="receipt"
        />,
      );

      // THEN: Chart components are not rendered
      expect(
        screen.queryByTestId("mock-responsive-container"),
      ).not.toBeInTheDocument();
    });
  });

  // ============================================
  // ACCESSIBILITY TESTS
  // ============================================
  describe("Accessibility", () => {
    it("[P0] STAT-005: should have correct ARIA attributes", () => {
      // GIVEN: StatCard with all props
      renderWithProviders(
        <StatCard
          id="accessible-card"
          label="Accessible Metric"
          value="$999"
          trend={{ value: "+5%", isPositive: true }}
          icon="receipt"
        />,
      );

      // THEN: ARIA attributes are correct
      const card = screen.getByTestId("stat-card-accessible-card");
      expect(card).toHaveAttribute("role", "listitem");
      expect(card).toHaveAttribute("tabindex", "0");
      expect(card).toHaveAttribute(
        "aria-label",
        "Accessible Metric: $999, up +5%",
      );
    });

    it("[P0] STAT-005b: should use custom aria-label when provided", () => {
      // GIVEN: StatCard with custom aria-label
      renderWithProviders(
        <StatCard
          id="custom-aria"
          label="Custom"
          value="$500"
          icon="receipt"
          aria-label="Custom accessibility label"
        />,
      );

      // THEN: Custom aria-label is used
      const card = screen.getByTestId("stat-card-custom-aria");
      expect(card).toHaveAttribute("aria-label", "Custom accessibility label");
    });

    it("[P1] STAT-005c: should have data-testid attribute", () => {
      // GIVEN: StatCard with custom testid
      renderWithProviders(
        <StatCard
          id="testid-card"
          label="Test"
          value="$100"
          icon="receipt"
          data-testid="custom-testid"
        />,
      );

      // THEN: Custom testid is used
      expect(screen.getByTestId("custom-testid")).toBeInTheDocument();
    });

    it("[P1] STAT-005d: should have analytics id attribute", () => {
      // GIVEN: StatCard
      renderWithProviders(
        <StatCard
          id="analytics-card"
          label="Analytics"
          value="$100"
          icon="receipt"
        />,
      );

      // THEN: Analytics ID is set
      const card = screen.getByTestId("stat-card-analytics-card");
      expect(card).toHaveAttribute(
        "data-analytics-id",
        "metric-analytics-card",
      );
    });
  });

  // ============================================
  // EDGE CASES
  // ============================================
  describe("Edge Cases", () => {
    it("[P1] STAT-006: should handle empty chart data array", () => {
      // GIVEN: StatCard with empty chart data
      renderWithProviders(
        <StatCard
          id="empty-chart"
          label="Empty Chart"
          value="$0"
          icon="receipt"
          chartData={[]}
        />,
      );

      // THEN: No chart is rendered
      expect(
        screen.queryByTestId("mock-responsive-container"),
      ).not.toBeInTheDocument();
    });

    it("[P1] STAT-006b: should handle invalid chart data values", () => {
      // GIVEN: StatCard with invalid data (NaN values)
      const invalidData = [
        { value: NaN },
        { value: 100 },
        { value: NaN },
      ] as ChartDataPoint[];

      renderWithProviders(
        <StatCard
          id="invalid-chart"
          label="Invalid Chart"
          value="$100"
          icon="receipt"
          chartData={invalidData}
        />,
      );

      // THEN: Only valid data is used (one valid point)
      expect(
        screen.getByTestId("mock-responsive-container"),
      ).toBeInTheDocument();
    });

    it("[P1] STAT-006c: should render without trend", () => {
      // GIVEN: StatCard without trend
      renderWithProviders(
        <StatCard id="no-trend" label="No Trend" value="$500" icon="receipt" />,
      );

      // THEN: Card renders without trend indicator
      expect(screen.getByText("$500")).toBeInTheDocument();
      expect(screen.queryByText("+")).not.toBeInTheDocument();
      expect(screen.queryByText("-")).not.toBeInTheDocument();
    });

    it("[P1] STAT-006d: should handle long label text", () => {
      // GIVEN: StatCard with very long label
      const longLabel = "This is a very long metric label that might overflow";

      renderWithProviders(
        <StatCard
          id="long-label"
          label={longLabel}
          value="$100"
          icon="receipt"
        />,
      );

      // THEN: Label is still rendered
      expect(screen.getByText(longLabel)).toBeInTheDocument();
    });
  });

  // ============================================
  // SECURITY TESTS
  // ============================================
  describe("Security", () => {
    it("[P0] STAT-007: should escape HTML in label (XSS prevention)", () => {
      // GIVEN: StatCard with potentially malicious label
      const xssLabel = '<script>alert("xss")</script>';

      renderWithProviders(
        <StatCard id="xss-test" label={xssLabel} value="$100" icon="receipt" />,
      );

      // THEN: Script tag is rendered as text, not executed
      expect(screen.getByText(xssLabel)).toBeInTheDocument();
      expect(document.querySelector("script")).toBeNull();
    });

    it("[P0] STAT-007b: should escape HTML in value (XSS prevention)", () => {
      // GIVEN: StatCard with potentially malicious value
      const xssValue = '<img src="x" onerror="alert(1)">';

      renderWithProviders(
        <StatCard
          id="xss-value-test"
          label="Test"
          value={xssValue}
          icon="receipt"
        />,
      );

      // THEN: Value is rendered as text
      expect(screen.getByText(xssValue)).toBeInTheDocument();
      expect(document.querySelector("img")).toBeNull();
    });
  });

  // ============================================
  // SKELETON TESTS
  // ============================================
  describe("StatCardSkeleton", () => {
    it("[P1] STAT-008: should render loading skeleton", () => {
      // GIVEN: StatCardSkeleton
      renderWithProviders(<StatCardSkeleton />);

      // THEN: Skeleton has animation class
      const skeleton = document.querySelector(".animate-pulse");
      expect(skeleton).toBeInTheDocument();
    });
  });
});
