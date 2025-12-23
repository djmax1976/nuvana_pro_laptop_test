/**
 * @test-level Component
 * @justification Component tests for SalesBreakdownSummary - validates sales metrics display
 * @story client-owner-dashboard-shift-detail-view
 */

import { describe, it, expect } from "vitest";
import { renderWithProviders, screen } from "../../../support/test-utils";
import { SalesBreakdownSummary } from "@/components/shifts/client-dashboard/SalesBreakdownSummary";

describe("CLIENT-DASHBOARD-COMPONENT: SalesBreakdownSummary Component", () => {
  it("[P0] SALES-SUMMARY-001: should render component with sales summary header", () => {
    // GIVEN: Component is rendered with sales data
    renderWithProviders(
      <SalesBreakdownSummary totalSales={1500.0} transactionCount={30} />,
    );

    // THEN: Should display header
    expect(screen.getByText("Sales Summary")).toBeInTheDocument();
    expect(screen.getByTestId("sales-breakdown-summary")).toBeInTheDocument();
  });

  it("[P0] SALES-SUMMARY-002: should display total sales correctly", () => {
    // GIVEN: Component is rendered with sales data
    renderWithProviders(
      <SalesBreakdownSummary totalSales={2500.5} transactionCount={50} />,
    );

    // THEN: Should display formatted total sales
    expect(screen.getByTestId("total-sales-metric")).toBeInTheDocument();
    expect(screen.getByText("Total Sales")).toBeInTheDocument();
    expect(screen.getByText("$2,500.50")).toBeInTheDocument();
  });

  it("[P0] SALES-SUMMARY-003: should display transaction count correctly", () => {
    // GIVEN: Component is rendered with transaction count
    renderWithProviders(
      <SalesBreakdownSummary totalSales={1000.0} transactionCount={42} />,
    );

    // THEN: Should display transaction count
    expect(screen.getByTestId("transaction-count-metric")).toBeInTheDocument();
    expect(screen.getByText("Transactions")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("transactions")).toBeInTheDocument();
  });

  it("[P0] SALES-SUMMARY-004: should calculate and display average transaction", () => {
    // GIVEN: Component is rendered with sales and transaction count
    // Average = 1500 / 30 = $50.00
    renderWithProviders(
      <SalesBreakdownSummary totalSales={1500.0} transactionCount={30} />,
    );

    // THEN: Should display average transaction
    expect(screen.getByTestId("avg-transaction-metric")).toBeInTheDocument();
    expect(screen.getByText("Avg. Transaction")).toBeInTheDocument();
    expect(screen.getByText("$50.00")).toBeInTheDocument();
    expect(screen.getByText("per transaction")).toBeInTheDocument();
  });

  it("[P1] SALES-SUMMARY-005: should handle single transaction pluralization", () => {
    // GIVEN: Component is rendered with single transaction
    renderWithProviders(
      <SalesBreakdownSummary totalSales={100.0} transactionCount={1} />,
    );

    // THEN: Should display singular "transaction"
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("transaction")).toBeInTheDocument();
  });

  it("[P1] SALES-SUMMARY-006: should handle zero transactions gracefully", () => {
    // GIVEN: Component is rendered with zero transactions
    renderWithProviders(
      <SalesBreakdownSummary totalSales={0} transactionCount={0} />,
    );

    // THEN: Should display zero values
    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.getAllByText("$0.00").length).toBeGreaterThanOrEqual(2);
  });

  it("[P1] SALES-SUMMARY-007: should display department breakdown placeholder", () => {
    // GIVEN: Component is rendered
    renderWithProviders(
      <SalesBreakdownSummary totalSales={1000.0} transactionCount={20} />,
    );

    // THEN: Should display department breakdown section
    expect(screen.getByText("Department Breakdown")).toBeInTheDocument();

    // AND: Should display POS integration message
    expect(
      screen.getByText(/Department-level sales breakdown/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/will be available when POS integration/),
    ).toBeInTheDocument();
  });

  it("[P1] SALES-SUMMARY-008: should display placeholder department categories", () => {
    // GIVEN: Component is rendered
    renderWithProviders(
      <SalesBreakdownSummary totalSales={1000.0} transactionCount={20} />,
    );

    // THEN: Should display placeholder department rows
    expect(screen.getByText("Gas Sales")).toBeInTheDocument();
    expect(screen.getByText("Grocery")).toBeInTheDocument();
    expect(screen.getByText("Tobacco")).toBeInTheDocument();
    expect(screen.getByText("Beverages")).toBeInTheDocument();
    expect(screen.getByText("Lottery")).toBeInTheDocument();
  });

  it("[P2] SALES-SUMMARY-009: should handle large numbers correctly", () => {
    // GIVEN: Component is rendered with large sales values
    renderWithProviders(
      <SalesBreakdownSummary totalSales={1234567.89} transactionCount={5000} />,
    );

    // THEN: Should format large currency correctly
    expect(screen.getByText("$1,234,567.89")).toBeInTheDocument();
    expect(screen.getByText("5000")).toBeInTheDocument();
  });

  it("[P2] SALES-SUMMARY-010: should calculate average correctly with decimals", () => {
    // GIVEN: Component with values that result in decimal average
    // Average = 333 / 7 = $47.57...
    renderWithProviders(
      <SalesBreakdownSummary totalSales={333.0} transactionCount={7} />,
    );

    // THEN: Should display average (formatCurrency handles rounding)
    expect(screen.getByText("$47.57")).toBeInTheDocument();
  });
});
