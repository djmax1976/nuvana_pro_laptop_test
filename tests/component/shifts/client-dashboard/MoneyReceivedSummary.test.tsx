/**
 * @test-level Component
 * @justification Component tests for MoneyReceivedSummary - validates payment methods display
 * @story client-owner-dashboard-shift-detail-view
 */

import { describe, it, expect } from "vitest";
import {
  renderWithProviders,
  screen,
  within,
} from "../../../support/test-utils";
import { MoneyReceivedSummary } from "@/components/shifts/client-dashboard/MoneyReceivedSummary";

describe("CLIENT-DASHBOARD-COMPONENT: MoneyReceivedSummary Component", () => {
  const mockPaymentMethods = [
    { method: "CASH", total: 500.0, count: 15 },
    { method: "CREDIT_CARD", total: 1200.0, count: 25 },
    { method: "DEBIT_CARD", total: 300.0, count: 8 },
    { method: "EBT", total: 150.0, count: 5 },
  ];

  it("[P0] MONEY-SUMMARY-001: should render component with payment methods header", () => {
    // GIVEN: Component is rendered with payment methods
    renderWithProviders(
      <MoneyReceivedSummary paymentMethods={mockPaymentMethods} />,
    );

    // THEN: Should display header
    expect(screen.getByText("Payment Methods")).toBeInTheDocument();
    expect(screen.getByTestId("money-received-summary")).toBeInTheDocument();
  });

  it("[P0] MONEY-SUMMARY-002: should display all payment methods with correct formatting", () => {
    // GIVEN: Component is rendered with various payment methods
    renderWithProviders(
      <MoneyReceivedSummary paymentMethods={mockPaymentMethods} />,
    );

    // THEN: Should display all payment method names (formatted)
    expect(screen.getByText("Cash")).toBeInTheDocument();
    expect(screen.getByText("Credit Card")).toBeInTheDocument();
    expect(screen.getByText("Debit Card")).toBeInTheDocument();
    expect(screen.getByText("EBT")).toBeInTheDocument();
  });

  it("[P0] MONEY-SUMMARY-003: should display payment amounts correctly", () => {
    // GIVEN: Component is rendered with payment methods
    renderWithProviders(
      <MoneyReceivedSummary paymentMethods={mockPaymentMethods} />,
    );

    // THEN: Should display formatted currency amounts
    expect(screen.getByText("$500.00")).toBeInTheDocument();
    expect(screen.getByText("$1,200.00")).toBeInTheDocument();
    expect(screen.getByText("$300.00")).toBeInTheDocument();
    expect(screen.getByText("$150.00")).toBeInTheDocument();
  });

  it("[P0] MONEY-SUMMARY-004: should display transaction counts with correct pluralization", () => {
    // GIVEN: Payment methods with various counts
    const methodsWithVariousCounts = [
      { method: "CASH", total: 100.0, count: 1 },
      { method: "CREDIT_CARD", total: 200.0, count: 5 },
    ];

    renderWithProviders(
      <MoneyReceivedSummary paymentMethods={methodsWithVariousCounts} />,
    );

    // THEN: Should display correct pluralization
    expect(screen.getByText("1 txn")).toBeInTheDocument();
    expect(screen.getByText("5 txns")).toBeInTheDocument();
  });

  it("[P0] MONEY-SUMMARY-005: should calculate and display total received", () => {
    // GIVEN: Component is rendered with payment methods
    renderWithProviders(
      <MoneyReceivedSummary paymentMethods={mockPaymentMethods} />,
    );

    // THEN: Should display total (500 + 1200 + 300 + 150 = 2150)
    expect(screen.getByText("Total Received")).toBeInTheDocument();
    expect(screen.getByText("$2,150.00")).toBeInTheDocument();

    // AND: Total transaction count (15 + 25 + 8 + 5 = 53)
    expect(screen.getByText("53 txns")).toBeInTheDocument();
  });

  it("[P1] MONEY-SUMMARY-006: should display empty state when no payment methods", () => {
    // GIVEN: Component is rendered with empty payment methods
    renderWithProviders(<MoneyReceivedSummary paymentMethods={[]} />);

    // THEN: Should display empty message
    expect(
      screen.getByText("No payment transactions recorded"),
    ).toBeInTheDocument();

    // AND: Should not display total row
    expect(screen.queryByText("Total Received")).not.toBeInTheDocument();
  });

  it("[P1] MONEY-SUMMARY-007: should handle lowercase payment method names", () => {
    // GIVEN: Payment methods with lowercase names
    const lowercaseMethods = [
      { method: "cash", total: 100.0, count: 5 },
      { method: "credit", total: 200.0, count: 3 },
    ];

    renderWithProviders(
      <MoneyReceivedSummary paymentMethods={lowercaseMethods} />,
    );

    // THEN: Should format method names correctly
    expect(screen.getByText("Cash")).toBeInTheDocument();
    expect(screen.getByText("Credit Card")).toBeInTheDocument();
  });

  it("[P1] MONEY-SUMMARY-008: should display column headers", () => {
    // GIVEN: Component is rendered
    renderWithProviders(
      <MoneyReceivedSummary paymentMethods={mockPaymentMethods} />,
    );

    // THEN: Should display column headers
    expect(screen.getByText("Payment Type")).toBeInTheDocument();
    expect(screen.getByText("Amount")).toBeInTheDocument();
    expect(screen.getByText("Count")).toBeInTheDocument();
  });

  it("[P2] MONEY-SUMMARY-009: should handle unknown payment method gracefully", () => {
    // GIVEN: Payment method with unknown type
    const unknownMethod = [{ method: "CUSTOM_TYPE", total: 50.0, count: 2 }];

    renderWithProviders(
      <MoneyReceivedSummary paymentMethods={unknownMethod} />,
    );

    // THEN: Should display the original method name
    expect(screen.getByText("CUSTOM_TYPE")).toBeInTheDocument();
    // Total appears twice: in line item and in total row
    expect(screen.getAllByText("$50.00").length).toBe(2);
  });

  it("[P2] MONEY-SUMMARY-010: should sort payment methods by total descending", () => {
    // GIVEN: Payment methods in random order (by total)
    const unsortedMethods = [
      { method: "EBT", total: 100.0, count: 2 },
      { method: "CASH", total: 500.0, count: 10 },
      { method: "CREDIT_CARD", total: 300.0, count: 5 },
    ];

    const { container } = renderWithProviders(
      <MoneyReceivedSummary paymentMethods={unsortedMethods} />,
    );

    // THEN: Methods should be grouped (cash first, then cards, then others)
    // Cash methods appear first
    const allText = container.textContent || "";
    const cashIndex = allText.indexOf("Cash");
    const creditIndex = allText.indexOf("Credit Card");
    const ebtIndex = allText.indexOf("EBT");

    // Cash should appear before credit/debit, which should appear before EBT
    expect(cashIndex).toBeLessThan(creditIndex);
    expect(creditIndex).toBeLessThan(ebtIndex);
  });
});
