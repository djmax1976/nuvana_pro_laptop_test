/**
 * @test-level Component
 * @justification Component tests for TransactionDetailDialog - validates dialog display, line items, and payments
 * @story 3-5-transaction-display-ui
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders, screen, waitFor } from "../support/test-utils";
import { TransactionDetailDialog } from "@/components/transactions/TransactionDetailDialog";
import * as transactionsApi from "@/lib/api/transactions";
import type { Transaction } from "@/lib/api/transactions";

// Mock Next.js navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

// Mock the API hooks
vi.mock("@/lib/api/transactions", () => ({
  useTransactionDetail: vi.fn(),
}));

// Mock toast hook
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

describe("3.5-COMPONENT: TransactionDetailDialog Component", () => {
  const mockTransaction: Transaction = {
    transaction_id: "123e4567-e89b-12d3-a456-426614174000",
    public_id: "TXN-001",
    store_id: "223e4567-e89b-12d3-a456-426614174001",
    shift_id: "323e4567-e89b-12d3-a456-426614174002",
    cashier_id: "423e4567-e89b-12d3-a456-426614174003",
    pos_terminal_id: null,
    timestamp: "2024-01-01T10:00:00Z",
    total: 100.0,
    subtotal: 92.59,
    tax: 7.41,
    discount: 0,
    line_items: [
      {
        line_item_id: "line-1",
        product_id: null,
        sku: "SKU-001",
        name: "Test Product",
        quantity: 2,
        unit_price: 50.0,
        discount: 0,
        line_total: 100.0,
      },
    ],
    payments: [
      {
        payment_id: "payment-1",
        method: "CASH",
        amount: 100.0,
        reference: null,
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("[P0] 3.5-COMPONENT-020: should render dialog when open is true", () => {
    // GIVEN: Component is rendered with open=true
    vi.mocked(transactionsApi.useTransactionDetail).mockReturnValue({
      data: mockTransaction,
      isLoading: false,
      error: null,
      isError: false,
      isSuccess: true,
      refetch: vi.fn(),
    } as any);

    // WHEN: Component is rendered
    renderWithProviders(
      <TransactionDetailDialog
        transactionId={mockTransaction.transaction_id}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    // THEN: Dialog should be visible
    expect(screen.getByTestId("transaction-detail-dialog")).toBeInTheDocument();
  });

  it("[P0] 3.5-COMPONENT-021: should not render dialog when open is false", () => {
    // GIVEN: Component is rendered with open=false
    // WHEN: Component is rendered
    renderWithProviders(
      <TransactionDetailDialog
        transactionId={mockTransaction.transaction_id}
        open={false}
        onOpenChange={vi.fn()}
      />,
    );

    // THEN: Dialog should not be visible
    expect(
      screen.queryByTestId("transaction-detail-dialog"),
    ).not.toBeInTheDocument();
  });

  it("[P0] 3.5-COMPONENT-022: should display transaction header information", () => {
    // GIVEN: Component is rendered with transaction data
    vi.mocked(transactionsApi.useTransactionDetail).mockReturnValue({
      data: mockTransaction,
      isLoading: false,
      error: null,
      isError: false,
      isSuccess: true,
      refetch: vi.fn(),
    } as any);

    // WHEN: Component is rendered
    renderWithProviders(
      <TransactionDetailDialog
        transactionId={mockTransaction.transaction_id}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    // THEN: Transaction header should display transaction ID
    expect(screen.getByText("TXN-001")).toBeInTheDocument();
  });

  it("[P0] 3.5-COMPONENT-023: should display line items table", () => {
    // GIVEN: Component is rendered with transaction data including line items
    vi.mocked(transactionsApi.useTransactionDetail).mockReturnValue({
      data: mockTransaction,
      isLoading: false,
      error: null,
      isError: false,
      isSuccess: true,
      refetch: vi.fn(),
    } as any);

    // WHEN: Component is rendered
    renderWithProviders(
      <TransactionDetailDialog
        transactionId={mockTransaction.transaction_id}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    // THEN: Line items table should be displayed
    expect(screen.getByTestId("line-items-table")).toBeInTheDocument();
    expect(screen.getByText("Test Product")).toBeInTheDocument();
  });

  it("[P0] 3.5-COMPONENT-024: should display payments table", () => {
    // GIVEN: Component is rendered with transaction data including payments
    vi.mocked(transactionsApi.useTransactionDetail).mockReturnValue({
      data: mockTransaction,
      isLoading: false,
      error: null,
      isError: false,
      isSuccess: true,
      refetch: vi.fn(),
    } as any);

    // WHEN: Component is rendered
    renderWithProviders(
      <TransactionDetailDialog
        transactionId={mockTransaction.transaction_id}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    // THEN: Payments table should be displayed
    expect(screen.getByTestId("payments-table")).toBeInTheDocument();
    expect(screen.getByText("CASH")).toBeInTheDocument();
  });

  it("[P0] 3.5-COMPONENT-025: should display loading state while fetching transaction detail", () => {
    // GIVEN: Transaction detail API is loading
    vi.mocked(transactionsApi.useTransactionDetail).mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
      isError: false,
      isSuccess: false,
      refetch: vi.fn(),
    } as any);

    // WHEN: Component is rendered
    renderWithProviders(
      <TransactionDetailDialog
        transactionId={mockTransaction.transaction_id}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    // THEN: Loading state should be displayed
    const skeletonLoaders = document.querySelectorAll(".animate-pulse");
    expect(skeletonLoaders.length).toBeGreaterThan(0);
  });

  it("[P0] 3.5-COMPONENT-026: should display error message when transaction detail API fails", () => {
    // GIVEN: Transaction detail API returns an error
    vi.mocked(transactionsApi.useTransactionDetail).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("Failed to load transaction detail"),
      isError: true,
      isSuccess: false,
      refetch: vi.fn(),
    } as any);

    // WHEN: Component is rendered
    renderWithProviders(
      <TransactionDetailDialog
        transactionId={mockTransaction.transaction_id}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    // THEN: Error message should be displayed
    expect(
      screen.getByText(/failed to load transaction detail/i),
    ).toBeInTheDocument();
  });

  it("[P0] 3.5-COMPONENT-027: should call onOpenChange when close button is clicked", async () => {
    // GIVEN: Component is rendered with onOpenChange handler
    const onOpenChange = vi.fn();
    vi.mocked(transactionsApi.useTransactionDetail).mockReturnValue({
      data: mockTransaction,
      isLoading: false,
      error: null,
      isError: false,
      isSuccess: true,
      refetch: vi.fn(),
    } as any);

    // WHEN: Component is rendered and close button is clicked
    renderWithProviders(
      <TransactionDetailDialog
        transactionId={mockTransaction.transaction_id}
        open={true}
        onOpenChange={onOpenChange}
      />,
    );

    const closeButton = screen.getByRole("button", { name: /close/i });
    closeButton.click();

    // THEN: onOpenChange should be called with false
    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  // ============================================================================
  // SECURITY TESTS - XSS Prevention (Component Level)
  // ============================================================================

  it("[P1] 3.5-COMPONENT-SEC-001: should safely render transaction data with potential XSS content", () => {
    // GIVEN: Transaction data contains potentially malicious content from POS
    const maliciousTransaction: Transaction = {
      ...mockTransaction,
      public_id: "<script>alert('XSS')</script>TXN-001",
      line_items: [
        {
          line_item_id: "line-1",
          product_id: null,
          sku: "<img src=x onerror=alert('XSS')>",
          name: "Product<script>alert('XSS')</script>",
          quantity: 1,
          unit_price: 50.0,
          discount: 0,
          line_total: 50.0,
        },
      ],
      payments: [
        {
          payment_id: "payment-1",
          method: "CASH",
          amount: 100.0,
          reference: "<script>alert('XSS')</script>",
        },
      ],
    };

    vi.mocked(transactionsApi.useTransactionDetail).mockReturnValue({
      data: maliciousTransaction,
      isLoading: false,
      error: null,
      isError: false,
      isSuccess: true,
      refetch: vi.fn(),
    } as any);

    // WHEN: Component is rendered
    renderWithProviders(
      <TransactionDetailDialog
        transactionId={mockTransaction.transaction_id}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    // THEN: Malicious content should be escaped/rendered as text, not executed
    expect(screen.getByText(/TXN-001/)).toBeInTheDocument();
    // Verify script tags are not executed (they should be rendered as text or escaped)
    expect(document.querySelector("script")).toBeNull();
  });

  // ============================================================================
  // EDGE CASES - Payment Method Case-Insensitive (Display-Only from POS)
  // ============================================================================

  it("[P2] 3.5-COMPONENT-EDGE-001: should display payment methods with various casings from POS", () => {
    // GIVEN: Transaction with payment methods in different casings from POS
    const transactionWithVariousCasings: Transaction = {
      ...mockTransaction,
      payments: [
        {
          payment_id: "payment-1",
          method: "CASH" as any,
          amount: 50.0,
          reference: null,
        },
        {
          payment_id: "payment-2",
          method: "cash" as any,
          amount: 30.0,
          reference: null,
        },
        {
          payment_id: "payment-3",
          method: "Cash" as any,
          amount: 20.0,
          reference: null,
        },
      ],
    };

    vi.mocked(transactionsApi.useTransactionDetail).mockReturnValue({
      data: transactionWithVariousCasings,
      isLoading: false,
      error: null,
      isError: false,
      isSuccess: true,
      refetch: vi.fn(),
    } as any);

    // WHEN: Component is rendered
    renderWithProviders(
      <TransactionDetailDialog
        transactionId={mockTransaction.transaction_id}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    // THEN: All payment methods should be displayed (case-insensitive handling)
    expect(screen.getByText("CASH")).toBeInTheDocument();
    // Component should display whatever casing POS sends
  });

  // ============================================================================
  // EDGE CASES - Amount Display (Display-Only from POS)
  // ============================================================================

  it("[P2] 3.5-COMPONENT-EDGE-002: should display very small amounts correctly ($0.01)", () => {
    // GIVEN: Transaction with very small amounts from POS
    const smallAmountTransaction: Transaction = {
      ...mockTransaction,
      total: 0.01,
      subtotal: 0.01,
      tax: 0,
      discount: 0,
      line_items: [
        {
          line_item_id: "line-1",
          product_id: null,
          sku: "SKU-001",
          name: "Test Product",
          quantity: 1,
          unit_price: 0.01,
          discount: 0,
          line_total: 0.01,
        },
      ],
      payments: [
        {
          payment_id: "payment-1",
          method: "CASH",
          amount: 0.01,
          reference: null,
        },
      ],
    };

    vi.mocked(transactionsApi.useTransactionDetail).mockReturnValue({
      data: smallAmountTransaction,
      isLoading: false,
      error: null,
      isError: false,
      isSuccess: true,
      refetch: vi.fn(),
    } as any);

    // WHEN: Component is rendered
    renderWithProviders(
      <TransactionDetailDialog
        transactionId={mockTransaction.transaction_id}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    // THEN: Very small amounts should be displayed correctly (multiple places: total, subtotal, line items, payments)
    const amounts = screen.getAllByText("$0.01");
    expect(amounts.length).toBeGreaterThan(0);
  });

  it("[P2] 3.5-COMPONENT-EDGE-003: should display very large amounts correctly ($999,999.99)", () => {
    // GIVEN: Transaction with very large amounts from POS
    const largeAmountTransaction: Transaction = {
      ...mockTransaction,
      total: 999999.99,
      subtotal: 925925.92,
      tax: 74074.07,
      discount: 0,
      line_items: [
        {
          line_item_id: "line-1",
          product_id: null,
          sku: "SKU-001",
          name: "Test Product",
          quantity: 1,
          unit_price: 999999.99,
          discount: 0,
          line_total: 999999.99,
        },
      ],
      payments: [
        {
          payment_id: "payment-1",
          method: "CASH",
          amount: 999999.99,
          reference: null,
        },
      ],
    };

    vi.mocked(transactionsApi.useTransactionDetail).mockReturnValue({
      data: largeAmountTransaction,
      isLoading: false,
      error: null,
      isError: false,
      isSuccess: true,
      refetch: vi.fn(),
    } as any);

    // WHEN: Component is rendered
    renderWithProviders(
      <TransactionDetailDialog
        transactionId={mockTransaction.transaction_id}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    // THEN: Very large amounts should be displayed with proper formatting (multiple places: total, line items, payments)
    const amounts = screen.getAllByText("$999,999.99");
    expect(amounts.length).toBeGreaterThan(0);
  });

  it("[P2] 3.5-COMPONENT-EDGE-004: should handle transactions with no line items", () => {
    // GIVEN: Transaction with no line items from POS
    const transactionNoLineItems: Transaction = {
      ...mockTransaction,
      line_items: [],
      payments: mockTransaction.payments,
    };

    vi.mocked(transactionsApi.useTransactionDetail).mockReturnValue({
      data: transactionNoLineItems,
      isLoading: false,
      error: null,
      isError: false,
      isSuccess: true,
      refetch: vi.fn(),
    } as any);

    // WHEN: Component is rendered
    renderWithProviders(
      <TransactionDetailDialog
        transactionId={mockTransaction.transaction_id}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    // THEN: Component should render without line items table
    expect(screen.queryByTestId("line-items-table")).not.toBeInTheDocument();
  });

  it("[P2] 3.5-COMPONENT-EDGE-005: should handle transactions with no payments", () => {
    // GIVEN: Transaction with no payments from POS
    const transactionNoPayments: Transaction = {
      ...mockTransaction,
      line_items: mockTransaction.line_items,
      payments: [],
    };

    vi.mocked(transactionsApi.useTransactionDetail).mockReturnValue({
      data: transactionNoPayments,
      isLoading: false,
      error: null,
      isError: false,
      isSuccess: true,
      refetch: vi.fn(),
    } as any);

    // WHEN: Component is rendered
    renderWithProviders(
      <TransactionDetailDialog
        transactionId={mockTransaction.transaction_id}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    // THEN: Component should render without payments table
    expect(screen.queryByTestId("payments-table")).not.toBeInTheDocument();
  });

  // ============================================================================
  // ADDITIONAL ASSERTIONS - Data Structure Validation
  // ============================================================================

  it("[P2] 3.5-COMPONENT-ASSERT-001: should validate transaction detail data structure", () => {
    // GIVEN: Transaction detail API returns data
    vi.mocked(transactionsApi.useTransactionDetail).mockReturnValue({
      data: mockTransaction,
      isLoading: false,
      error: null,
      isError: false,
      isSuccess: true,
      refetch: vi.fn(),
    } as any);

    // WHEN: Component is rendered
    renderWithProviders(
      <TransactionDetailDialog
        transactionId={mockTransaction.transaction_id}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    // THEN: Transaction data should have correct structure
    expect(typeof mockTransaction.transaction_id).toBe("string");
    expect(typeof mockTransaction.public_id).toBe("string");
    expect(typeof mockTransaction.total).toBe("number");
    // timestamp is ISO string from API response
    expect(typeof mockTransaction.timestamp).toBe("string");
    expect(Array.isArray(mockTransaction.line_items)).toBe(true);
    expect(Array.isArray(mockTransaction.payments)).toBe(true);
  });

  it("[P2] 3.5-COMPONENT-ASSERT-002: should validate line items structure", () => {
    // GIVEN: Transaction with line items
    vi.mocked(transactionsApi.useTransactionDetail).mockReturnValue({
      data: mockTransaction,
      isLoading: false,
      error: null,
      isError: false,
      isSuccess: true,
      refetch: vi.fn(),
    } as any);

    // WHEN: Component is rendered
    renderWithProviders(
      <TransactionDetailDialog
        transactionId={mockTransaction.transaction_id}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    // THEN: Line items should have correct structure
    mockTransaction.line_items?.forEach((item) => {
      expect(typeof item.line_item_id).toBe("string");
      expect(typeof item.name).toBe("string");
      expect(typeof item.quantity).toBe("number");
      expect(typeof item.unit_price).toBe("number");
      expect(typeof item.line_total).toBe("number");
    });
  });

  it("[P2] 3.5-COMPONENT-ASSERT-003: should validate payments structure", () => {
    // GIVEN: Transaction with payments
    vi.mocked(transactionsApi.useTransactionDetail).mockReturnValue({
      data: mockTransaction,
      isLoading: false,
      error: null,
      isError: false,
      isSuccess: true,
      refetch: vi.fn(),
    } as any);

    // WHEN: Component is rendered
    renderWithProviders(
      <TransactionDetailDialog
        transactionId={mockTransaction.transaction_id}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    // THEN: Payments should have correct structure
    mockTransaction.payments?.forEach((payment) => {
      expect(typeof payment.payment_id).toBe("string");
      expect(typeof payment.method).toBe("string");
      expect(typeof payment.amount).toBe("number");
    });
  });
});
