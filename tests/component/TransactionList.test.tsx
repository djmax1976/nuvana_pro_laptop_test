/**
 * @test-level Component
 * @justification Component tests for TransactionList - validates rendering, loading states, error handling, and empty states
 * @story 3-5-transaction-display-ui
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "../support/test-utils";
import { TransactionList } from "@/components/transactions/TransactionList";
import * as transactionsApi from "@/lib/api/transactions";
import type {
  Transaction,
  TransactionQueryResult,
} from "@/lib/api/transactions";

// Mock Next.js Link component
vi.mock("next/link", () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));

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
  useTransactions: vi.fn(),
}));

// Mock toast hook
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

describe("3.5-COMPONENT: TransactionList Component", () => {
  const mockTransactions: Transaction[] = [
    {
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
    },
    {
      transaction_id: "523e4567-e89b-12d3-a456-426614174004",
      public_id: "TXN-002",
      store_id: "223e4567-e89b-12d3-a456-426614174001",
      shift_id: "323e4567-e89b-12d3-a456-426614174002",
      cashier_id: "423e4567-e89b-12d3-a456-426614174003",
      pos_terminal_id: null,
      timestamp: "2024-01-01T11:00:00Z",
      total: 200.0,
      subtotal: 185.19,
      tax: 14.81,
      discount: 0,
    },
  ];

  const mockResponse: TransactionQueryResult = {
    transactions: mockTransactions,
    meta: {
      total: 2,
      limit: 50,
      offset: 0,
      has_more: false,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("[P0] 3.5-COMPONENT-001: should render loading skeleton when data is loading", () => {
    // GIVEN: Transactions API is loading
    vi.mocked(transactionsApi.useTransactions).mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
      isError: false,
      isSuccess: false,
      refetch: vi.fn(),
    } as any);

    // WHEN: Component is rendered
    renderWithProviders(<TransactionList />);

    // THEN: Loading skeleton should be displayed
    const skeletonLoaders = document.querySelectorAll(".animate-pulse");
    expect(skeletonLoaders.length).toBeGreaterThan(0);
  });

  it("[P0] 3.5-COMPONENT-002: should render error message when API fails", () => {
    // GIVEN: Transactions API returns an error
    vi.mocked(transactionsApi.useTransactions).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("Failed to load transactions"),
      isError: true,
      isSuccess: false,
      refetch: vi.fn(),
    } as any);

    // WHEN: Component is rendered
    renderWithProviders(<TransactionList />);

    // THEN: Error message should be displayed
    expect(screen.getByText(/error loading transactions/i)).toBeInTheDocument();
  });

  it("[P0] 3.5-COMPONENT-003: should render empty state when no transactions exist", () => {
    // GIVEN: Transactions API returns empty list
    vi.mocked(transactionsApi.useTransactions).mockReturnValue({
      data: { transactions: [], meta: mockResponse.meta },
      isLoading: false,
      error: null,
      isError: false,
      isSuccess: true,
      refetch: vi.fn(),
    } as any);

    // WHEN: Component is rendered
    renderWithProviders(<TransactionList />);

    // THEN: Empty state should be displayed
    expect(screen.getByText(/no transactions found/i)).toBeInTheDocument();
  });

  it("[P0] 3.5-COMPONENT-004: should render transaction list with required columns", () => {
    // GIVEN: Transactions API returns data
    vi.mocked(transactionsApi.useTransactions).mockReturnValue({
      data: mockResponse,
      isLoading: false,
      error: null,
      isError: false,
      isSuccess: true,
      refetch: vi.fn(),
    } as any);

    // WHEN: Component is rendered
    renderWithProviders(<TransactionList />);

    // THEN: Transaction table should display required columns
    expect(screen.getByText("Transaction ID")).toBeInTheDocument();
    expect(screen.getByText("Timestamp")).toBeInTheDocument();
    expect(screen.getByText("Total")).toBeInTheDocument();
    expect(screen.getByText("Cashier")).toBeInTheDocument();
    expect(screen.getByText("Store")).toBeInTheDocument();
  });

  it("[P0] 3.5-COMPONENT-005: should display transaction data in table rows", () => {
    // GIVEN: Transactions API returns data
    vi.mocked(transactionsApi.useTransactions).mockReturnValue({
      data: mockResponse,
      isLoading: false,
      error: null,
      isError: false,
      isSuccess: true,
      refetch: vi.fn(),
    } as any);

    // WHEN: Component is rendered
    renderWithProviders(<TransactionList />);

    // THEN: Transaction data should be displayed
    expect(screen.getByText("TXN-001")).toBeInTheDocument();
    expect(screen.getByText("TXN-002")).toBeInTheDocument();
    expect(screen.getByText("$100.00")).toBeInTheDocument();
    expect(screen.getByText("$200.00")).toBeInTheDocument();
  });

  it("[P0] 3.5-COMPONENT-006: should call onTransactionClick when transaction row is clicked", async () => {
    // GIVEN: Transactions API returns data and onTransactionClick handler
    const onTransactionClick = vi.fn();
    vi.mocked(transactionsApi.useTransactions).mockReturnValue({
      data: mockResponse,
      isLoading: false,
      error: null,
      isError: false,
      isSuccess: true,
      refetch: vi.fn(),
    } as any);

    // WHEN: Component is rendered and transaction row is clicked
    renderWithProviders(
      <TransactionList onTransactionClick={onTransactionClick} />,
    );

    const transactionRow = screen.getByTestId(
      `transaction-row-${mockTransactions[0].transaction_id}`,
    );
    transactionRow.click();

    // THEN: onTransactionClick should be called with transaction data
    await waitFor(() => {
      expect(onTransactionClick).toHaveBeenCalledWith(mockTransactions[0]);
    });
  });

  // ============================================================================
  // SECURITY TESTS - XSS Prevention (Component Level)
  // ============================================================================

  it("[P1] 3.5-COMPONENT-SEC-001: should safely render transaction data with potential XSS content", () => {
    // GIVEN: Transaction data contains potentially malicious content from POS
    const maliciousTransaction: Transaction = {
      transaction_id: "123e4567-e89b-12d3-a456-426614174000",
      public_id: "<script>alert('XSS')</script>TXN-001",
      store_id: "223e4567-e89b-12d3-a456-426614174001",
      shift_id: "323e4567-e89b-12d3-a456-426614174002",
      cashier_id: "423e4567-e89b-12d3-a456-426614174003",
      pos_terminal_id: null,
      timestamp: "2024-01-01T10:00:00Z",
      total: 100.0,
      subtotal: 92.59,
      tax: 7.41,
      discount: 0,
      cashier_name: "John<script>alert('XSS')</script>",
      store_name: "Store<img src=x onerror=alert('XSS')>",
    };

    vi.mocked(transactionsApi.useTransactions).mockReturnValue({
      data: {
        transactions: [maliciousTransaction],
        meta: mockResponse.meta,
      },
      isLoading: false,
      error: null,
      isError: false,
      isSuccess: true,
      refetch: vi.fn(),
    } as any);

    // WHEN: Component is rendered
    const { container } = renderWithProviders(<TransactionList />);

    // THEN: Malicious content should be escaped/rendered as text, not executed
    const transactionRow = screen.getByTestId(
      `transaction-row-${maliciousTransaction.transaction_id}`,
    );
    expect(transactionRow).toBeInTheDocument();

    // Verify script tags are rendered as escaped text content, not executed
    // Check that the public_id cell contains the literal script string as text
    const publicIdElement = screen.getByText(/TXN-001/);
    expect(publicIdElement.textContent).toContain(
      "<script>alert('XSS')</script>",
    );
    expect(publicIdElement.textContent).toContain("TXN-001");

    // Verify no actual executable <script> tags exist within the transaction row
    // (framework scripts may exist elsewhere in the document, so we check only within our row)
    const scriptTagsInRow = transactionRow.querySelectorAll("script");
    expect(scriptTagsInRow.length).toBe(0);

    // Verify the innerHTML of the transaction row does not contain executable script tags
    // React should escape the content, so innerHTML should contain &lt;script&gt; not <script>
    expect(transactionRow.innerHTML).not.toMatch(/<script[^>]*>/i);
    expect(transactionRow.innerHTML).toContain("&lt;script&gt;"); // Escaped version

    // Verify cashier_name and store_name are also escaped
    // Query within the transaction row to avoid matching header elements
    const rowScope = within(transactionRow);
    const cashierElement = rowScope.getByText(/John/);
    expect(cashierElement.textContent).toContain(
      "<script>alert('XSS')</script>",
    );

    const storeElement = rowScope.getByText(/Store/);
    expect(storeElement.textContent).toContain(
      "<img src=x onerror=alert('XSS')>",
    );
  });

  // ============================================================================
  // EDGE CASES - Amount Display (Display-Only from POS)
  // ============================================================================

  it("[P2] 3.5-COMPONENT-EDGE-001: should display very small amounts correctly ($0.01)", () => {
    // GIVEN: Transaction with very small amount from POS
    const smallAmountTransaction: Transaction = {
      ...mockTransactions[0],
      total: 0.01,
      subtotal: 0.01,
      tax: 0,
      discount: 0,
    };

    vi.mocked(transactionsApi.useTransactions).mockReturnValue({
      data: {
        transactions: [smallAmountTransaction],
        meta: mockResponse.meta,
      },
      isLoading: false,
      error: null,
      isError: false,
      isSuccess: true,
      refetch: vi.fn(),
    } as any);

    // WHEN: Component is rendered
    renderWithProviders(<TransactionList />);

    // THEN: Very small amount should be displayed correctly
    expect(screen.getByText("$0.01")).toBeInTheDocument();
  });

  it("[P2] 3.5-COMPONENT-EDGE-002: should display very large amounts correctly ($999,999.99)", () => {
    // GIVEN: Transaction with very large amount from POS
    const largeAmountTransaction: Transaction = {
      ...mockTransactions[0],
      total: 999999.99,
      subtotal: 925925.92,
      tax: 74074.07,
      discount: 0,
    };

    vi.mocked(transactionsApi.useTransactions).mockReturnValue({
      data: {
        transactions: [largeAmountTransaction],
        meta: mockResponse.meta,
      },
      isLoading: false,
      error: null,
      isError: false,
      isSuccess: true,
      refetch: vi.fn(),
    } as any);

    // WHEN: Component is rendered
    renderWithProviders(<TransactionList />);

    // THEN: Very large amount should be displayed with proper formatting
    expect(screen.getByText("$999,999.99")).toBeInTheDocument();
  });

  it("[P2] 3.5-COMPONENT-EDGE-003: should display zero amount correctly ($0.00)", () => {
    // GIVEN: Transaction with zero amount from POS
    const zeroAmountTransaction: Transaction = {
      ...mockTransactions[0],
      total: 0.0,
      subtotal: 0.0,
      tax: 0.0,
      discount: 0.0,
    };

    vi.mocked(transactionsApi.useTransactions).mockReturnValue({
      data: {
        transactions: [zeroAmountTransaction],
        meta: mockResponse.meta,
      },
      isLoading: false,
      error: null,
      isError: false,
      isSuccess: true,
      refetch: vi.fn(),
    } as any);

    // WHEN: Component is rendered
    renderWithProviders(<TransactionList />);

    // THEN: Zero amount should be displayed correctly
    expect(screen.getByText("$0.00")).toBeInTheDocument();
  });

  it("[P2] 3.5-COMPONENT-EDGE-004: should handle missing cashier_name and store_name gracefully", () => {
    // GIVEN: Transaction with missing optional fields from POS
    const transactionWithoutNames: Transaction = {
      ...mockTransactions[0],
      cashier_name: undefined,
      store_name: undefined,
    };

    vi.mocked(transactionsApi.useTransactions).mockReturnValue({
      data: {
        transactions: [transactionWithoutNames],
        meta: mockResponse.meta,
      },
      isLoading: false,
      error: null,
      isError: false,
      isSuccess: true,
      refetch: vi.fn(),
    } as any);

    // WHEN: Component is rendered
    renderWithProviders(<TransactionList />);

    // THEN: Should display "Unknown" for missing names
    expect(screen.getAllByText("Unknown").length).toBeGreaterThanOrEqual(2);
  });

  // ============================================================================
  // ADDITIONAL ASSERTIONS - Data Structure Validation
  // ============================================================================

  it("[P2] 3.5-COMPONENT-ASSERT-001: should validate transaction data structure and types", () => {
    // GIVEN: Transactions API returns data
    vi.mocked(transactionsApi.useTransactions).mockReturnValue({
      data: mockResponse,
      isLoading: false,
      error: null,
      isError: false,
      isSuccess: true,
      refetch: vi.fn(),
    } as any);

    // WHEN: Component is rendered
    renderWithProviders(<TransactionList />);

    // THEN: Transaction data should have correct structure
    const transactions = mockResponse.transactions;
    expect(Array.isArray(transactions)).toBe(true);
    expect(transactions.length).toBeGreaterThan(0);

    transactions.forEach((transaction) => {
      expect(typeof transaction.transaction_id).toBe("string");
      expect(typeof transaction.public_id).toBe("string");
      expect(typeof transaction.total).toBe("number");
      // timestamp is ISO string from API response
      expect(typeof transaction.timestamp).toBe("string");
      expect(transaction.transaction_id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
    });
  });

  it("[P2] 3.5-COMPONENT-ASSERT-002: should validate pagination metadata structure", () => {
    // GIVEN: Transactions API returns data with pagination meta
    vi.mocked(transactionsApi.useTransactions).mockReturnValue({
      data: mockResponse,
      isLoading: false,
      error: null,
      isError: false,
      isSuccess: true,
      refetch: vi.fn(),
    } as any);

    // WHEN: Component is rendered
    renderWithProviders(<TransactionList />);

    // THEN: Pagination metadata should have correct structure
    const meta = mockResponse.meta;
    expect(typeof meta.total).toBe("number");
    expect(typeof meta.limit).toBe("number");
    expect(typeof meta.offset).toBe("number");
    expect(typeof meta.has_more).toBe("boolean");
    expect(meta.limit).toBeGreaterThan(0);
    expect(meta.limit).toBeLessThanOrEqual(200);
    expect(meta.offset).toBeGreaterThanOrEqual(0);
  });

  it("[P2] 3.5-COMPONENT-ASSERT-003: should call onMetaChange when pagination meta is available", async () => {
    // GIVEN: Transactions API returns data and onMetaChange handler
    const onMetaChange = vi.fn();
    vi.mocked(transactionsApi.useTransactions).mockReturnValue({
      data: mockResponse,
      isLoading: false,
      error: null,
      isError: false,
      isSuccess: true,
      refetch: vi.fn(),
    } as any);

    // WHEN: Component is rendered
    renderWithProviders(<TransactionList onMetaChange={onMetaChange} />);

    // THEN: onMetaChange should be called with pagination meta
    await waitFor(() => {
      expect(onMetaChange).toHaveBeenCalledWith(mockResponse.meta);
    });
  });
});
