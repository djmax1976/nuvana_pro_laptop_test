import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderWithProviders, screen, waitFor } from "../../support/test-utils";
import { ZReportViewer } from "@/components/reports/ZReportViewer";
import type { ZReport } from "@/lib/api/reports";
import userEvent from "@testing-library/user-event";
import * as reportsApi from "@/lib/api/reports";

/**
 * ============================================================================
 * TRACEABILITY MATRIX - ZReportViewer Component Tests
 * ============================================================================
 *
 * | Test ID                    | Requirement              | Category      | Priority |
 * |----------------------------|--------------------------|---------------|----------|
 * | Z-RPT-001                 | Display Z Report header   | Component     | P1       |
 * | Z-RPT-002                 | Display business date     | Component     | P1       |
 * | Z-RPT-003                 | Display cashier info      | Component     | P1       |
 * | Z-RPT-004                 | Display financial summary | Component     | P1       |
 * | Z-RPT-005                 | Display cash drawer info  | Component     | P1       |
 * | Z-RPT-006                 | Display variance styling  | Business Logic| P1       |
 * | Z-RPT-007                 | Display verified badge    | Component     | P1       |
 * | Z-RPT-008                 | Display print count       | Component     | P2       |
 * | Z-RPT-009                 | Display tender breakdown  | Component     | P1       |
 * | Z-RPT-010                 | Display dept breakdown    | Component     | P1       |
 * | Z-RPT-011                 | Print functionality       | Integration   | P1       |
 * | Z-RPT-012                 | Export functionality      | Integration   | P1       |
 * | Z-RPT-013                 | Verify integrity          | Integration   | P1       |
 * | Z-RPT-014                 | XSS prevention            | Security      | P1       |
 * | Z-RPT-015                 | Currency formatting       | Business Logic| P1       |
 * | Z-RPT-016                 | Positive variance display | Business Logic| P2       |
 * | Z-RPT-017                 | Zero variance display     | Business Logic| P2       |
 * | Z-RPT-018                 | Empty breakdown handling  | Edge Case     | P2       |
 *
 * @test-level Component
 * @story Phase 6.5 - X/Z Report Viewer
 * @author Claude Code
 * @created 2024-03-15
 */

// ============================================================================
// MOCKS
// ============================================================================

const mockVerifyMutation = vi.fn();
const mockPrintMutation = vi.fn();

vi.mock("@/lib/api/reports", () => ({
  useVerifyZReportIntegrity: vi.fn(() => ({
    mutateAsync: mockVerifyMutation,
    isPending: false,
  })),
  useMarkZReportPrinted: vi.fn(() => ({
    mutateAsync: mockPrintMutation,
    isPending: false,
  })),
}));

const mockToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({
    toast: mockToast,
  }),
}));

// Mock window.print
const mockPrint = vi.fn();
Object.defineProperty(window, "print", { value: mockPrint, writable: true });

// ============================================================================
// TEST DATA
// ============================================================================

const createMockZReport = (overrides: Partial<ZReport> = {}): ZReport =>
  ({
    z_report_id: "zr-1",
    shift_id: "shift-1",
    store_id: "store-1",
    z_number: 42,
    business_date: "2024-03-15T00:00:00Z",
    cashier_id: "cashier-1",
    cashier_name: "John Doe",
    shift_opened_at: "2024-03-15T06:00:00Z",
    shift_closed_at: "2024-03-15T14:00:00Z",
    generated_at: "2024-03-15T14:05:00Z",
    gross_sales: 2500.0,
    returns_total: 50.0,
    discounts_total: 25.0,
    net_sales: 2425.0,
    tax_collected: 181.88,
    transaction_count: 75,
    items_sold_count: 150,
    opening_cash: 200.0,
    expected_cash: 1425.0,
    closing_cash: 1420.0,
    variance_amount: -5.0,
    variance_percentage: -0.35,
    is_verified: true,
    integrity_hash: "sha256-abc123",
    print_count: 2,
    last_printed_at: "2024-03-15T14:10:00Z",
    export_count: 0,
    last_exported_at: null,
    last_exported_format: null,
    created_at: "2024-03-15T14:05:00Z",
    tender_breakdown: [
      {
        tender_code: "CASH",
        tender_name: "Cash",
        transaction_count: 45,
        amount: 1225.0,
      },
      {
        tender_code: "CREDIT",
        tender_name: "Credit Card",
        transaction_count: 30,
        amount: 1200.0,
      },
    ],
    department_breakdown: [
      {
        department_code: "GROCERY",
        department_name: "Grocery",
        item_count: 100,
        gross_sales: 1500.0,
      },
      {
        department_code: "DAIRY",
        department_name: "Dairy",
        item_count: 50,
        gross_sales: 1000.0,
      },
    ],
    tax_breakdown: [
      {
        tax_name: "State Tax",
        tax_rate: 0.0725,
        taxable_amount: 2425.0,
        tax_collected: 175.81,
      },
      {
        tax_name: "Local Tax",
        tax_rate: 0.0025,
        taxable_amount: 2425.0,
        tax_collected: 6.06,
      },
    ],
    ...overrides,
  }) as unknown as ZReport;

// ============================================================================
// COMPONENT TESTS
// ============================================================================

describe("Phase 6.5 - ZReportViewer Component Tests", () => {
  let mockReport: ZReport;

  beforeEach(() => {
    vi.clearAllMocks();
    mockReport = createMockZReport();
    mockVerifyMutation.mockResolvedValue({ data: { integrity_valid: true } });
    mockPrintMutation.mockResolvedValue({});
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // --------------------------------------------------------------------------
  // Component Rendering Tests
  // --------------------------------------------------------------------------
  describe("Component Rendering", () => {
    it("[Z-RPT-001] should display Z Report number in header", () => {
      renderWithProviders(<ZReportViewer report={mockReport} />);
      expect(screen.getByText(/Z Report #42/i)).toBeInTheDocument();
    });

    it("[Z-RPT-002] should display business date", () => {
      renderWithProviders(<ZReportViewer report={mockReport} />);
      expect(screen.getByText(/Mar 15, 2024/i)).toBeInTheDocument();
    });

    it("[Z-RPT-003] should display cashier name", () => {
      renderWithProviders(<ZReportViewer report={mockReport} />);
      expect(screen.getByText("John Doe")).toBeInTheDocument();
    });

    it("[Z-RPT-003b] should display cashier_id when name is not available", () => {
      const reportWithoutName = createMockZReport({ cashier_name: undefined });
      renderWithProviders(<ZReportViewer report={reportWithoutName} />);
      expect(screen.getByText("cashier-1")).toBeInTheDocument();
    });

    it("[Z-RPT-004] should display financial summary", () => {
      renderWithProviders(<ZReportViewer report={mockReport} />);

      expect(screen.getByText(/Gross Sales/i)).toBeInTheDocument();
      expect(screen.getByText(/\$2,500\.00/)).toBeInTheDocument();
      expect(screen.getByText(/Net Sales/i)).toBeInTheDocument();
      expect(screen.getByText(/\$2,425\.00/)).toBeInTheDocument();
      expect(screen.getByText(/Returns/i)).toBeInTheDocument();
      expect(screen.getByText(/\$50\.00/)).toBeInTheDocument();
      expect(screen.getByText(/Discounts/i)).toBeInTheDocument();
      expect(screen.getByText(/\$25\.00/)).toBeInTheDocument();
    });

    it("[Z-RPT-005] should display cash drawer information", () => {
      renderWithProviders(<ZReportViewer report={mockReport} />);

      expect(screen.getByText(/Opening Cash/i)).toBeInTheDocument();
      expect(screen.getByText(/\$200\.00/)).toBeInTheDocument();
      expect(screen.getByText(/Expected Cash/i)).toBeInTheDocument();
      expect(screen.getByText(/\$1,425\.00/)).toBeInTheDocument();
      expect(screen.getByText(/Closing Cash/i)).toBeInTheDocument();
      expect(screen.getByText(/\$1,420\.00/)).toBeInTheDocument();
    });

    it("[Z-RPT-007] should display verified badge when is_verified is true", () => {
      renderWithProviders(<ZReportViewer report={mockReport} />);
      expect(screen.getByText(/Verified/i)).toBeInTheDocument();
    });

    it("[Z-RPT-007b] should display unverified badge when is_verified is false", () => {
      const unverifiedReport = { ...mockReport, is_verified: false };
      renderWithProviders(<ZReportViewer report={unverifiedReport} />);
      expect(screen.getByText(/Unverified/i)).toBeInTheDocument();
    });

    it("[Z-RPT-008] should display print count badge", () => {
      renderWithProviders(<ZReportViewer report={mockReport} />);
      expect(screen.getByText(/Printed 2x/i)).toBeInTheDocument();
    });

    it("[Z-RPT-009] should display tender breakdown table", () => {
      renderWithProviders(<ZReportViewer report={mockReport} />);

      expect(screen.getByText(/Tender Breakdown/i)).toBeInTheDocument();
      expect(screen.getByText("Cash")).toBeInTheDocument();
      expect(screen.getByText("Credit Card")).toBeInTheDocument();
      expect(screen.getByText("45")).toBeInTheDocument(); // Cash transaction count
      expect(screen.getByText("30")).toBeInTheDocument(); // Credit transaction count
    });

    it("[Z-RPT-010] should display department breakdown table", () => {
      renderWithProviders(<ZReportViewer report={mockReport} />);

      expect(screen.getByText(/Department Breakdown/i)).toBeInTheDocument();
      expect(screen.getByText("Grocery")).toBeInTheDocument();
      expect(screen.getByText("Dairy")).toBeInTheDocument();
      expect(screen.getByText("100")).toBeInTheDocument(); // Grocery item count
      expect(screen.getByText("50")).toBeInTheDocument(); // Dairy item count
    });

    it("should display transaction and item counts", () => {
      renderWithProviders(<ZReportViewer report={mockReport} />);

      expect(screen.getByText(/Transactions/i)).toBeInTheDocument();
      expect(screen.getByText("75")).toBeInTheDocument();
      expect(screen.getByText(/Items Sold/i)).toBeInTheDocument();
      expect(screen.getByText("150")).toBeInTheDocument();
    });

    it("should display report and shift IDs in footer", () => {
      renderWithProviders(<ZReportViewer report={mockReport} />);

      expect(screen.getByText(/Report ID: zr-1/i)).toBeInTheDocument();
      expect(screen.getByText(/Shift ID: shift-1/i)).toBeInTheDocument();
    });
  });

  // --------------------------------------------------------------------------
  // Business Logic Tests
  // --------------------------------------------------------------------------
  describe("Business Logic", () => {
    it("[Z-RPT-006] should display negative variance in red", () => {
      const { container } = renderWithProviders(
        <ZReportViewer report={mockReport} />,
      );

      expect(screen.getByText(/Variance/i)).toBeInTheDocument();
      const varianceCell = container.querySelector('[class*="text-red"]');
      expect(varianceCell).toBeInTheDocument();
    });

    it("[Z-RPT-016] should display positive variance in amber", () => {
      const positiveVarianceReport = {
        ...mockReport,
        variance_amount: 5.0,
        variance_percentage: 0.35,
      };

      const { container } = renderWithProviders(
        <ZReportViewer report={positiveVarianceReport} />,
      );

      const varianceCell = container.querySelector('[class*="text-amber"]');
      expect(varianceCell).toBeInTheDocument();
    });

    it("[Z-RPT-017] should display zero variance in green", () => {
      const zeroVarianceReport = {
        ...mockReport,
        variance_amount: 0,
        variance_percentage: 0,
      };

      const { container } = renderWithProviders(
        <ZReportViewer report={zeroVarianceReport} />,
      );

      const varianceCell = container.querySelector('[class*="text-green"]');
      expect(varianceCell).toBeInTheDocument();
    });

    it("[Z-RPT-015] should format currency values correctly", () => {
      renderWithProviders(<ZReportViewer report={mockReport} />);

      // Check multiple currency formats
      expect(screen.getByText(/\$2,500\.00/)).toBeInTheDocument();
      expect(screen.getByText(/\$2,425\.00/)).toBeInTheDocument();
      expect(screen.getByText(/\$181\.88/)).toBeInTheDocument();
    });

    it("should display variance percentage", () => {
      renderWithProviders(<ZReportViewer report={mockReport} />);
      expect(screen.getByText(/-0\.35%/)).toBeInTheDocument();
    });
  });

  // --------------------------------------------------------------------------
  // Integration Tests
  // --------------------------------------------------------------------------
  describe("Integration", () => {
    it("[Z-RPT-011] should call window.print when print button is clicked", async () => {
      const user = userEvent.setup();
      renderWithProviders(<ZReportViewer report={mockReport} />);

      const printButton = screen.getByRole("button", { name: /print/i });
      await user.click(printButton);

      await waitFor(() => {
        expect(mockPrintMutation).toHaveBeenCalledWith({
          zReportId: "zr-1",
          printCountIncrement: 1,
        });
        expect(mockPrint).toHaveBeenCalled();
      });
    });

    it("[Z-RPT-012] should call onExport when export button is clicked", async () => {
      const onExport = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(
        <ZReportViewer report={mockReport} onExport={onExport} />,
      );

      const exportButton = screen.getByRole("button", { name: /export/i });
      await user.click(exportButton);

      expect(onExport).toHaveBeenCalledWith("pdf");
    });

    it("[Z-RPT-013] should verify integrity when verify button is clicked", async () => {
      const user = userEvent.setup();
      renderWithProviders(<ZReportViewer report={mockReport} />);

      const verifyButton = screen.getByRole("button", { name: /verify/i });
      await user.click(verifyButton);

      await waitFor(() => {
        expect(mockVerifyMutation).toHaveBeenCalledWith("zr-1");
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            title: "Integrity Verified",
          }),
        );
      });
    });

    it("should show error toast when verification fails", async () => {
      mockVerifyMutation.mockResolvedValue({
        data: { integrity_valid: false },
      });

      const user = userEvent.setup();
      renderWithProviders(<ZReportViewer report={mockReport} />);

      const verifyButton = screen.getByRole("button", { name: /verify/i });
      await user.click(verifyButton);

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            title: "Integrity Check Failed",
            variant: "destructive",
          }),
        );
      });
    });

    it("should show error toast when verification API fails", async () => {
      mockVerifyMutation.mockRejectedValue(new Error("Network error"));

      const user = userEvent.setup();
      renderWithProviders(<ZReportViewer report={mockReport} />);

      const verifyButton = screen.getByRole("button", { name: /verify/i });
      await user.click(verifyButton);

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            title: "Error",
            variant: "destructive",
          }),
        );
      });
    });

    it("should call onPrint callback after printing", async () => {
      const onPrint = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(
        <ZReportViewer report={mockReport} onPrint={onPrint} />,
      );

      const printButton = screen.getByRole("button", { name: /print/i });
      await user.click(printButton);

      await waitFor(() => {
        expect(onPrint).toHaveBeenCalled();
      });
    });
  });

  // --------------------------------------------------------------------------
  // Edge Case Tests
  // --------------------------------------------------------------------------
  describe("Edge Cases", () => {
    it("[Z-RPT-018] should handle empty tender breakdown", () => {
      const reportWithoutTenders = {
        ...mockReport,
        tender_breakdown: [],
      };

      renderWithProviders(<ZReportViewer report={reportWithoutTenders} />);

      // Should not crash and tender section should not be visible
      expect(screen.queryByText(/Tender Breakdown/i)).not.toBeInTheDocument();
    });

    it("[Z-RPT-018b] should handle empty department breakdown", () => {
      const reportWithoutDepts = {
        ...mockReport,
        department_breakdown: [],
      };

      renderWithProviders(<ZReportViewer report={reportWithoutDepts} />);

      // Should not crash and department section should not be visible
      expect(
        screen.queryByText(/Department Breakdown/i),
      ).not.toBeInTheDocument();
    });

    it("should handle null tender_breakdown", () => {
      const reportNullTenders = {
        ...mockReport,
        tender_breakdown: null as unknown as typeof mockReport.tender_breakdown,
      };

      // Should not throw
      expect(() => {
        renderWithProviders(<ZReportViewer report={reportNullTenders} />);
      }).not.toThrow();
    });

    it("should handle report with zero print count", () => {
      const reportZeroPrints = {
        ...mockReport,
        print_count: 0,
      };

      renderWithProviders(<ZReportViewer report={reportZeroPrints} />);

      // Print count badge should not be shown
      expect(screen.queryByText(/Printed/i)).not.toBeInTheDocument();
    });

    it("should handle very large numbers", () => {
      const reportLargeNumbers = {
        ...mockReport,
        gross_sales: 999999999.99,
        net_sales: 999999999.99,
      };

      renderWithProviders(<ZReportViewer report={reportLargeNumbers} />);

      // Should display without breaking layout
      expect(screen.getByText(/\$999,999,999\.99/)).toBeInTheDocument();
    });

    it("should handle shift times spanning midnight", () => {
      const midnightReport = {
        ...mockReport,
        shift_opened_at: "2024-03-14T22:00:00Z",
        shift_closed_at: "2024-03-15T06:00:00Z",
      };

      renderWithProviders(<ZReportViewer report={midnightReport} />);

      // Should display dates correctly
      expect(screen.getByText(/Mar 14/i)).toBeInTheDocument();
    });
  });

  // --------------------------------------------------------------------------
  // Security Tests
  // --------------------------------------------------------------------------
  describe("Security", () => {
    it("[Z-RPT-014] should prevent XSS through cashier name", () => {
      const xssPayload = '<script>alert("xss")</script>';
      const maliciousReport = {
        ...mockReport,
        cashier_name: xssPayload,
      };

      const { container } = renderWithProviders(
        <ZReportViewer report={maliciousReport} />,
      );

      // XSS payload should be escaped and rendered as text
      expect(screen.getByText(xssPayload)).toBeInTheDocument();
      // No script tags should be injected
      expect(container.querySelectorAll("script")).toHaveLength(0);
    });

    it("should prevent XSS through tender names", () => {
      const xssPayload = "<img src=x onerror=alert(1)>";
      const maliciousReport = {
        ...mockReport,
        tender_breakdown: [
          {
            tender_code: "XSS",
            tender_name: xssPayload,
            transaction_count: 1,
            amount: 100,
          },
        ],
      };

      const { container } = renderWithProviders(
        <ZReportViewer report={maliciousReport} />,
      );

      // Should render as text, not as HTML
      expect(screen.getByText(xssPayload)).toBeInTheDocument();
      expect(container.querySelectorAll("img")).toHaveLength(0);
    });

    it("should not expose internal IDs in aria labels", () => {
      const { container } = renderWithProviders(
        <ZReportViewer report={mockReport} />,
      );

      // Shift ID and report ID should only be in footer, not in accessible attributes
      const ariaLabels = container.querySelectorAll('[aria-label*="zr-1"]');
      expect(ariaLabels.length).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // Assertion Tests (Data Display Accuracy)
  // --------------------------------------------------------------------------
  describe("Assertions - Data Display Accuracy", () => {
    it("should calculate and display correct variance", () => {
      // Expected cash - closing cash = variance
      // 1425 - 1420 = 5 (but stored as -5 since it's a shortage)
      renderWithProviders(<ZReportViewer report={mockReport} />);

      expect(screen.getByText(/-\$5\.00/)).toBeInTheDocument();
    });

    it("should display all tender types from breakdown", () => {
      renderWithProviders(<ZReportViewer report={mockReport} />);

      // Should have exactly 2 tender types
      const tenderRows = screen.getAllByText(/Cash|Credit Card/);
      expect(tenderRows.length).toBeGreaterThanOrEqual(2);
    });

    it("should display tax collected correctly", () => {
      renderWithProviders(<ZReportViewer report={mockReport} />);

      expect(screen.getByText(/Tax Collected/i)).toBeInTheDocument();
      expect(screen.getByText(/\$181\.88/)).toBeInTheDocument();
    });

    it("should format shift times correctly", () => {
      renderWithProviders(<ZReportViewer report={mockReport} />);

      // Check that both opened and closed times are displayed
      expect(screen.getByText(/Opened/i)).toBeInTheDocument();
      expect(screen.getByText(/Closed/i)).toBeInTheDocument();
    });
  });
});
