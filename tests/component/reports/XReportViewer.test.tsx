import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders, screen } from "../../support/test-utils";
import { XReportViewer } from "@/components/reports/XReportViewer";
import userEvent from "@testing-library/user-event";

/**
 * @test-level Component
 * @justification UI component tests for XReportViewer - tests rendering and print functionality
 * @story Phase 6.5 - X/Z Report Viewer
 *
 * Component Tests: XReportViewer
 *
 * CRITICAL TEST COVERAGE:
 * - Displays X Report header with number and date
 * - Shows financial summary (gross sales, returns, discounts, net sales)
 * - Shows current cash drawer status
 * - Displays tender and department breakdowns
 * - Print and export functionality
 * - Shows interim snapshot indicator
 */

// Mock window.print
const mockPrint = vi.fn();
Object.defineProperty(window, "print", { value: mockPrint });

describe("Phase 6.5-COMPONENT: XReportViewer - Display X Report", () => {
  const mockReport = {
    x_report_id: "xr-1",
    shift_id: "shift-1",
    x_number: 3,
    business_date: "2024-03-15T00:00:00Z",
    cashier_id: "cashier-1",
    cashier_name: "Jane Smith",
    shift_opened_at: "2024-03-15T06:00:00Z",
    shift_status: "open",
    generated_at: "2024-03-15T12:00:00Z",
    gross_sales: 1200.0,
    returns_total: 25.0,
    discounts_total: 15.0,
    net_sales: 1160.0,
    tax_collected: 87.0,
    transaction_count: 35,
    items_sold_count: 70,
    opening_cash: 200.0,
    expected_cash: 860.0,
    cash_in_drawer: 855.0,
    current_variance: -5.0,
    tender_breakdown: [
      {
        tender_code: "CASH",
        tender_name: "Cash",
        transaction_count: 20,
        amount: 660.0,
      },
      {
        tender_code: "CREDIT",
        tender_name: "Credit Card",
        transaction_count: 15,
        amount: 500.0,
      },
    ],
    department_breakdown: [
      {
        department_code: "GROCERY",
        department_name: "Grocery",
        item_count: 45,
        gross_sales: 700.0,
      },
      {
        department_code: "SNACKS",
        department_name: "Snacks",
        item_count: 25,
        gross_sales: 500.0,
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should display X Report number in header", () => {
    renderWithProviders(<XReportViewer report={mockReport} />);

    expect(screen.getByText(/X Report #3/i)).toBeInTheDocument();
  });

  it("should display business date", () => {
    renderWithProviders(<XReportViewer report={mockReport} />);

    expect(screen.getByText(/Mar 15, 2024/i)).toBeInTheDocument();
  });

  it("should display cashier name", () => {
    renderWithProviders(<XReportViewer report={mockReport} />);

    expect(screen.getByText("Jane Smith")).toBeInTheDocument();
  });

  it("should display interim snapshot badge", () => {
    renderWithProviders(<XReportViewer report={mockReport} />);

    expect(screen.getByText(/Interim Snapshot/i)).toBeInTheDocument();
  });

  it("should display shift status", () => {
    renderWithProviders(<XReportViewer report={mockReport} />);

    expect(screen.getByText(/open/i)).toBeInTheDocument();
  });

  it("should display financial summary", () => {
    renderWithProviders(<XReportViewer report={mockReport} />);

    expect(screen.getByText(/Gross Sales/i)).toBeInTheDocument();
    expect(screen.getByText(/\$1,200\.00/)).toBeInTheDocument();
    expect(screen.getByText(/Net Sales/i)).toBeInTheDocument();
    expect(screen.getByText(/\$1,160\.00/)).toBeInTheDocument();
  });

  it("should display returns and discounts", () => {
    renderWithProviders(<XReportViewer report={mockReport} />);

    expect(screen.getByText(/Returns/i)).toBeInTheDocument();
    expect(screen.getByText(/\$25\.00/)).toBeInTheDocument();
    expect(screen.getByText(/Discounts/i)).toBeInTheDocument();
    expect(screen.getByText(/\$15\.00/)).toBeInTheDocument();
  });

  it("should display cash drawer status", () => {
    renderWithProviders(<XReportViewer report={mockReport} />);

    expect(screen.getByText(/Opening Cash/i)).toBeInTheDocument();
    expect(screen.getByText(/\$200\.00/)).toBeInTheDocument();
    expect(screen.getByText(/Expected Cash/i)).toBeInTheDocument();
    expect(screen.getByText(/\$860\.00/)).toBeInTheDocument();
    expect(screen.getByText(/Cash In Drawer/i)).toBeInTheDocument();
    expect(screen.getByText(/\$855\.00/)).toBeInTheDocument();
  });

  it("should display current variance with negative styling", () => {
    const { container } = renderWithProviders(
      <XReportViewer report={mockReport} />,
    );

    expect(screen.getByText(/Current Variance/i)).toBeInTheDocument();
    expect(screen.getByText(/-\$5\.00/)).toBeInTheDocument();

    const varianceCell = container.querySelector('[class*="text-red"]');
    expect(varianceCell).toBeInTheDocument();
  });

  it("should display tender breakdown table", () => {
    renderWithProviders(<XReportViewer report={mockReport} />);

    expect(screen.getByText(/Tender Breakdown/i)).toBeInTheDocument();
    expect(screen.getByText("Cash")).toBeInTheDocument();
    expect(screen.getByText("Credit Card")).toBeInTheDocument();
  });

  it("should display department breakdown table", () => {
    renderWithProviders(<XReportViewer report={mockReport} />);

    expect(screen.getByText(/Department Breakdown/i)).toBeInTheDocument();
    expect(screen.getByText("Grocery")).toBeInTheDocument();
    expect(screen.getByText("Snacks")).toBeInTheDocument();
  });

  it("should call window.print when print button is clicked", async () => {
    const user = userEvent.setup();
    renderWithProviders(<XReportViewer report={mockReport} />);

    const printButton = screen.getByRole("button", { name: /print/i });
    await user.click(printButton);

    expect(mockPrint).toHaveBeenCalled();
  });

  it("should call onExport when export button is clicked", async () => {
    const onExport = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <XReportViewer report={mockReport} onExport={onExport} />,
    );

    const exportButton = screen.getByRole("button", { name: /export/i });
    await user.click(exportButton);

    expect(onExport).toHaveBeenCalledWith("pdf");
  });

  it("should display transaction and item counts", () => {
    renderWithProviders(<XReportViewer report={mockReport} />);

    expect(screen.getByText(/Transactions/i)).toBeInTheDocument();
    expect(screen.getByText("35")).toBeInTheDocument();
    expect(screen.getByText(/Items Sold/i)).toBeInTheDocument();
    expect(screen.getByText("70")).toBeInTheDocument();
  });

  it("should display report and shift IDs in footer", () => {
    renderWithProviders(<XReportViewer report={mockReport} />);

    expect(screen.getByText(/Report ID: xr-1/i)).toBeInTheDocument();
    expect(screen.getByText(/Shift ID: shift-1/i)).toBeInTheDocument();
  });

  it("should display final figures note in footer", () => {
    renderWithProviders(<XReportViewer report={mockReport} />);

    expect(screen.getByText(/interim snapshot/i)).toBeInTheDocument();
    expect(screen.getByText(/Z Report/i)).toBeInTheDocument();
  });

  it("should display zero variance in green", () => {
    const zeroVarianceReport = {
      ...mockReport,
      current_variance: 0,
    };

    const { container } = renderWithProviders(
      <XReportViewer report={zeroVarianceReport} />,
    );

    const varianceCell = container.querySelector('[class*="text-green"]');
    expect(varianceCell).toBeInTheDocument();
  });

  it("should display positive variance in amber", () => {
    const positiveVarianceReport = {
      ...mockReport,
      current_variance: 5.0,
    };

    const { container } = renderWithProviders(
      <XReportViewer report={positiveVarianceReport} />,
    );

    const varianceCell = container.querySelector('[class*="text-amber"]');
    expect(varianceCell).toBeInTheDocument();
  });
});
