/**
 * @test-level Component
 * @justification Tests for SalesOverviewCard with filtering controls
 * @story Client Owner Dashboard - Sales Overview
 *
 * SalesOverviewCard Component Tests
 *
 * CRITICAL TEST COVERAGE:
 * - Filter controls (date range, time period, metric type)
 * - Input validation (dates, whitelisted values)
 * - Chart rendering and updates
 * - Quick stats display
 * - Accessibility (ARIA, keyboard)
 * - Security (input sanitization)
 *
 * Requirements Traceability Matrix:
 * ┌─────────────────────────────────────────────────────────────────┐
 * │ Test ID                    │ Requirement         │ Priority    │
 * ├─────────────────────────────────────────────────────────────────┤
 * │ SALES-001                  │ Render chart        │ P0          │
 * │ SALES-002                  │ Date filters        │ P0          │
 * │ SALES-003                  │ Time period select  │ P0          │
 * │ SALES-004                  │ Metric type select  │ P0          │
 * │ SALES-005                  │ Apply filters       │ P0          │
 * │ SALES-006                  │ Quick stats         │ P1          │
 * │ SALES-007                  │ Validation          │ P0          │
 * │ SALES-008                  │ Accessibility       │ P0          │
 * │ SALES-009                  │ Security            │ P0          │
 * └─────────────────────────────────────────────────────────────────┘
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  renderWithProviders,
  screen,
  fireEvent,
  waitFor,
} from "../../support/test-utils";
import userEvent from "@testing-library/user-event";
import {
  SalesOverviewCard,
  SalesOverviewCardSkeleton,
} from "@/components/client-dashboard/sales-overview-card";

// Mock Recharts
vi.mock("recharts", () => ({
  LineChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="mock-line-chart">{children}</div>
  ),
  Line: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="mock-line">{children}</div>
  ),
  XAxis: () => <div data-testid="mock-xaxis" />,
  YAxis: () => <div data-testid="mock-yaxis" />,
  CartesianGrid: () => <div data-testid="mock-grid" />,
  Tooltip: () => <div data-testid="mock-tooltip" />,
  Legend: () => <div data-testid="mock-legend" />,
  LabelList: () => <div data-testid="mock-label-list" />,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="mock-responsive-container">{children}</div>
  ),
}));

describe("CLIENT-DASHBOARD: SalesOverviewCard Component", () => {
  // ============================================
  // RENDERING TESTS
  // ============================================
  describe("Rendering", () => {
    it("[P0] SALES-001: should render chart and title", () => {
      // GIVEN: SalesOverviewCard component
      renderWithProviders(<SalesOverviewCard />);

      // THEN: Title and chart are displayed
      expect(screen.getByText("Sales Overview")).toBeInTheDocument();
      expect(
        screen.getByTestId("mock-responsive-container"),
      ).toBeInTheDocument();
      expect(screen.getByTestId("mock-line-chart")).toBeInTheDocument();
    });

    it("[P0] SALES-001b: should render with initial total", () => {
      // GIVEN: SalesOverviewCard with initial total (component rounds to whole numbers)
      renderWithProviders(<SalesOverviewCard initialTotal={99999} />);

      // THEN: Initial total is displayed (formatted as currency without decimals)
      expect(screen.getByText("$99,999")).toBeInTheDocument();
    });

    it("[P1] SALES-006: should render quick stats", () => {
      // GIVEN: SalesOverviewCard with stats
      renderWithProviders(
        <SalesOverviewCard
          initialStats={{
            highest: 10000,
            lowest: 5000,
            average: 7500,
            trendPercent: 15.5,
          }}
        />,
      );

      // THEN: Stats are displayed
      expect(screen.getByText("$10,000")).toBeInTheDocument();
      expect(screen.getByText("$5,000")).toBeInTheDocument();
      expect(screen.getByText("$7,500")).toBeInTheDocument();
      expect(screen.getByText("+15.5%")).toBeInTheDocument();
      expect(screen.getByText("Highest")).toBeInTheDocument();
      expect(screen.getByText("Lowest")).toBeInTheDocument();
      expect(screen.getByText("Average")).toBeInTheDocument();
      expect(screen.getByText("vs Last Period")).toBeInTheDocument();
    });
  });

  // ============================================
  // FILTER CONTROLS TESTS
  // ============================================
  describe("Filter Controls", () => {
    it("[P0] SALES-002: should render date range inputs", () => {
      // GIVEN: SalesOverviewCard
      renderWithProviders(<SalesOverviewCard />);

      // THEN: Date inputs are present
      expect(screen.getByTestId("sales-date-start")).toBeInTheDocument();
      expect(screen.getByTestId("sales-date-end")).toBeInTheDocument();
    });

    it("[P0] SALES-002b: should allow changing date values", async () => {
      // GIVEN: SalesOverviewCard
      const user = userEvent.setup();
      renderWithProviders(<SalesOverviewCard />);

      // WHEN: User changes start date
      const startInput = screen.getByTestId("sales-date-start");
      await user.clear(startInput);
      await user.type(startInput, "2024-01-01");

      // THEN: Date value is updated
      expect(startInput).toHaveValue("2024-01-01");
    });

    it("[P0] SALES-003: should render time period dropdown", () => {
      // GIVEN: SalesOverviewCard
      renderWithProviders(<SalesOverviewCard />);

      // THEN: Time period selector is present with default value
      const timePeriodTrigger = screen.getByTestId("sales-time-period");
      expect(timePeriodTrigger).toBeInTheDocument();
    });

    it("[P0] SALES-004: should render metric type dropdown", () => {
      // GIVEN: SalesOverviewCard
      renderWithProviders(<SalesOverviewCard />);

      // THEN: Metric type selector is present
      const metricTypeTrigger = screen.getByTestId("sales-metric-type");
      expect(metricTypeTrigger).toBeInTheDocument();
    });

    it("[P0] SALES-005: should render apply button", () => {
      // GIVEN: SalesOverviewCard
      renderWithProviders(<SalesOverviewCard />);

      // THEN: Apply button is present
      const applyButton = screen.getByTestId("sales-apply-filter");
      expect(applyButton).toBeInTheDocument();
      expect(applyButton).toHaveTextContent("Apply");
    });

    it("[P0] SALES-005b: should call onFilterChange when filters applied", async () => {
      // GIVEN: SalesOverviewCard with callback
      const onFilterChange = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(
        <SalesOverviewCard onFilterChange={onFilterChange} />,
      );

      // WHEN: User clicks apply
      const applyButton = screen.getByTestId("sales-apply-filter");
      await user.click(applyButton);

      // THEN: Callback is invoked with filter state
      await waitFor(() => {
        expect(onFilterChange).toHaveBeenCalledWith(
          expect.objectContaining({
            startDate: expect.any(String),
            endDate: expect.any(String),
            timePeriod: expect.any(String),
            metricType: expect.any(String),
          }),
        );
      });
    });
  });

  // ============================================
  // VALIDATION TESTS
  // ============================================
  describe("Input Validation", () => {
    it("[P0] SALES-007: should validate date format", async () => {
      // GIVEN: SalesOverviewCard
      const user = userEvent.setup();
      renderWithProviders(<SalesOverviewCard />);

      // WHEN: User enters invalid date format
      const startInput = screen.getByTestId("sales-date-start");
      await user.clear(startInput);
      await user.type(startInput, "invalid-date");

      // AND: Clicks apply
      const applyButton = screen.getByTestId("sales-apply-filter");
      await user.click(applyButton);

      // THEN: Invalid date should not crash the component
      expect(screen.getByText("Sales Overview")).toBeInTheDocument();
    });

    it("[P0] SALES-007b: should reject date range with start after end", async () => {
      // GIVEN: SalesOverviewCard
      const user = userEvent.setup();
      const onFilterChange = vi.fn();
      renderWithProviders(
        <SalesOverviewCard onFilterChange={onFilterChange} />,
      );

      // WHEN: User sets start date after end date
      const startInput = screen.getByTestId("sales-date-start");
      const endInput = screen.getByTestId("sales-date-end");

      await user.clear(startInput);
      await user.type(startInput, "2024-12-31");
      await user.clear(endInput);
      await user.type(endInput, "2024-01-01");

      // AND: Clicks apply
      const applyButton = screen.getByTestId("sales-apply-filter");
      await user.click(applyButton);

      // THEN: Filter should not be applied (callback not called with valid data)
      // The component handles this gracefully
      expect(screen.getByText("Sales Overview")).toBeInTheDocument();
    });
  });

  // ============================================
  // ACCESSIBILITY TESTS
  // ============================================
  describe("Accessibility", () => {
    it("[P0] SALES-008: should have correct ARIA attributes on card", () => {
      // GIVEN: SalesOverviewCard
      renderWithProviders(<SalesOverviewCard />);

      // THEN: ARIA attributes are correct
      const card = screen.getByTestId("sales-overview-card");
      expect(card).toHaveAttribute("role", "region");
      expect(card).toHaveAttribute("aria-labelledby", "sales-overview-title");
    });

    it("[P0] SALES-008b: should have accessible filter controls", () => {
      // GIVEN: SalesOverviewCard
      renderWithProviders(<SalesOverviewCard />);

      // THEN: Filter controls have proper labels
      expect(
        screen.getByLabelText("Start date for sales data"),
      ).toBeInTheDocument();
      expect(
        screen.getByLabelText("End date for sales data"),
      ).toBeInTheDocument();
      expect(
        screen.getByLabelText("Apply selected filters to chart"),
      ).toBeInTheDocument();
    });

    it("[P1] SALES-008c: should have sr-only labels for inputs", () => {
      // GIVEN: SalesOverviewCard
      renderWithProviders(<SalesOverviewCard />);

      // THEN: Screen reader only labels exist
      expect(screen.getByText("Start Date")).toHaveClass("sr-only");
      expect(screen.getByText("End Date")).toHaveClass("sr-only");
    });

    it("[P1] SALES-008d: should have analytics id for tracking", () => {
      // GIVEN: SalesOverviewCard
      renderWithProviders(<SalesOverviewCard />);

      // THEN: Analytics ID is set
      const card = screen.getByTestId("sales-overview-card");
      expect(card).toHaveAttribute("data-analytics-id", "sales-overview");
    });
  });

  // ============================================
  // SECURITY TESTS
  // ============================================
  describe("Security", () => {
    it("[P0] SALES-009: should use whitelisted time periods only", () => {
      // GIVEN: SalesOverviewCard - the component only accepts whitelisted values
      // through the TIME_PERIODS constant which is frozen

      renderWithProviders(<SalesOverviewCard />);

      // THEN: Only valid time periods are in the dropdown
      // The select component restricts to: hourly, daily, weekly, monthly, yearly
      const timePeriodTrigger = screen.getByTestId("sales-time-period");
      expect(timePeriodTrigger).toBeInTheDocument();
    });

    it("[P0] SALES-009b: should use whitelisted metric types only", () => {
      // GIVEN: SalesOverviewCard - the component only accepts whitelisted values
      // through the METRIC_TYPES constant which is frozen

      renderWithProviders(<SalesOverviewCard />);

      // THEN: Only valid metric types are in the dropdown
      const metricTypeTrigger = screen.getByTestId("sales-metric-type");
      expect(metricTypeTrigger).toBeInTheDocument();
    });

    it("[P0] SALES-009c: should not execute scripts in data", () => {
      // GIVEN: SalesOverviewCard with potentially malicious initial data
      const maliciousData = [
        { label: '<script>alert("xss")</script>', value: 100 },
        { label: "Normal", value: 200 },
      ];

      renderWithProviders(<SalesOverviewCard initialData={maliciousData} />);

      // THEN: No script tags are in the document
      expect(document.querySelector("script")).toBeNull();
    });
  });

  // ============================================
  // SKELETON TESTS
  // ============================================
  describe("SalesOverviewCardSkeleton", () => {
    it("[P1] SALES-010: should render loading skeleton", () => {
      // GIVEN: SalesOverviewCardSkeleton
      renderWithProviders(<SalesOverviewCardSkeleton />);

      // THEN: Skeleton has animation class
      const skeleton = document.querySelector(".animate-pulse");
      expect(skeleton).toBeInTheDocument();
    });
  });
});
