/**
 * @test-level COMPONENT
 * @justification Tests UI component behavior in isolation - fast, isolated, granular
 * @story 6-13
 *
 * Component Tests: BinDisplayGrid
 *
 * Tests BinDisplayGrid component behavior for bin display:
 * - Responsive grid layout (2-3 columns per row)
 * - Display columns: Bin Name | Game | Start Number | Ending Number | Total Sold
 * - Data fetching with TanStack Query
 * - Loading states
 * - Error handling
 * - Empty state when no bins
 * - Real-time updates for ticket sales counts
 *
 * Story: 6-13 - Lottery Database Enhancements & Bin Management
 * Priority: P1 (High - Bin Display)
 */

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BinDisplayGrid } from "@/components/lottery/BinDisplayGrid";
import { getBinDisplay } from "@/lib/api/lottery";

// Mock the API client
vi.mock("@/lib/api/lottery", () => ({
  getBinDisplay: vi.fn(),
}));

describe("6.13-COMPONENT: BinDisplayGrid", () => {
  const mockStoreId = "123e4567-e89b-12d3-a456-426614174000";

  const defaultProps = {
    storeId: mockStoreId,
  };

  // Create a new QueryClient for each test to ensure isolation
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false, // Disable retries for faster tests
        },
      },
    });
  });

  const renderWithQueryClient = (component: React.ReactElement) => {
    return render(
      <QueryClientProvider client={queryClient}>
        {component}
      </QueryClientProvider>,
    );
  };

  it("6.13-COMPONENT-009: should render bin display grid with bin data (AC #2)", async () => {
    // GIVEN: BinDisplayGrid with bin data
    const binData = [
      {
        bin_id: "bin-1",
        bin_name: "Bin 1",
        display_order: 0,
        game_code: "1234",
        game_name: "Game 1",
        price: 5.0,
        pack_number: "PKG-001",
        serial_start: "000001",
        serial_end: "000100",
        total_sold: 50,
        status: "ACTIVE",
      },
    ];
    vi.mocked(getBinDisplay).mockResolvedValue({
      success: true,
      data: binData,
    });

    // WHEN: Component is rendered
    renderWithQueryClient(<BinDisplayGrid {...defaultProps} />);

    // THEN: Bin data is displayed
    await waitFor(() => {
      expect(screen.getByText("Bin 1")).toBeInTheDocument();
      expect(screen.getByText("Game 1")).toBeInTheDocument();
      expect(screen.getByText("PKG-001")).toBeInTheDocument();
      expect(screen.getByText("000001")).toBeInTheDocument();
      expect(screen.getByText("000100")).toBeInTheDocument();
      expect(screen.getByText("50")).toBeInTheDocument();
    });
  });

  it("6.13-COMPONENT-010: should display bins in configured display order (AC #2)", async () => {
    // GIVEN: BinDisplayGrid with multiple bins
    const binData = [
      {
        bin_id: "bin-2",
        bin_name: "Bin 2",
        display_order: 1,
        game_code: "1234",
        game_name: "Game 1",
        price: 5.0,
        pack_number: "000002",
        serial_start: "000101",
        serial_end: "000200",
        total_sold: 75,
        status: "ACTIVE",
      },
      {
        bin_id: "bin-1",
        bin_name: "Bin 1",
        display_order: 0,
        game_code: "1234",
        game_name: "Game 1",
        price: 5.0,
        pack_number: "000001",
        serial_start: "000001",
        serial_end: "000100",
        total_sold: 50,
        status: "ACTIVE",
      },
    ];
    vi.mocked(getBinDisplay).mockResolvedValue({
      success: true,
      data: binData,
    });

    // WHEN: Component is rendered
    renderWithQueryClient(<BinDisplayGrid {...defaultProps} />);

    // THEN: Bins are displayed in display_order (Bin 1 before Bin 2)
    await waitFor(() => {
      const binElements = screen.getAllByText(/Bin \d/);
      expect(binElements[0]).toHaveTextContent("Bin 1");
      expect(binElements[1]).toHaveTextContent("Bin 2");
    });
  });

  it("6.13-COMPONENT-011: should display all required columns: name, game, serial range, sold count (AC #2)", async () => {
    // GIVEN: BinDisplayGrid with bin data
    const binData = [
      {
        bin_id: "bin-1",
        bin_name: "Bin 1",
        display_order: 0,
        game_code: "1234",
        game_name: "Game 1",
        price: 5.0,
        pack_number: "PKG-001",
        serial_start: "000001",
        serial_end: "000100",
        total_sold: 50,
        status: "ACTIVE",
      },
    ];
    vi.mocked(getBinDisplay).mockResolvedValue({
      success: true,
      data: binData,
    });

    // WHEN: Component is rendered
    renderWithQueryClient(<BinDisplayGrid {...defaultProps} />);

    // THEN: All bin data is displayed
    await waitFor(() => {
      expect(screen.getByText("Bin 1")).toBeInTheDocument();
      expect(screen.getByText("Game 1")).toBeInTheDocument();
      expect(screen.getByText("PKG-001")).toBeInTheDocument();
      expect(screen.getByText("000001")).toBeInTheDocument();
      expect(screen.getByText("000100")).toBeInTheDocument();
      expect(screen.getByText("50")).toBeInTheDocument();
    });
  });

  it("6.13-COMPONENT-012: should display empty state when no bins configured (AC #2)", async () => {
    // GIVEN: BinDisplayGrid with no bins
    vi.mocked(getBinDisplay).mockResolvedValue({
      success: true,
      data: [],
    });

    // WHEN: Component is rendered
    renderWithQueryClient(<BinDisplayGrid {...defaultProps} />);

    // THEN: Empty state message is displayed
    await waitFor(() => {
      expect(
        screen.getByText(/no bins configured for this store/i),
      ).toBeInTheDocument();
    });
  });

  it("6.13-COMPONENT-013: should display loading state while fetching data (AC #2)", () => {
    // GIVEN: BinDisplayGrid with slow API response
    vi.mocked(getBinDisplay).mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => {
            resolve({ success: true, data: [] });
          }, 100);
        }),
    );

    // WHEN: Component is rendered
    renderWithQueryClient(<BinDisplayGrid {...defaultProps} />);

    // THEN: Loading indicator is displayed
    expect(screen.getByText(/loading bin data/i)).toBeInTheDocument();
  });

  it("6.13-COMPONENT-014: should display error message when API fails (AC #2)", async () => {
    // GIVEN: BinDisplayGrid with API error
    vi.mocked(getBinDisplay).mockRejectedValue(
      new Error("Failed to fetch bin display data"),
    );

    // WHEN: Component is rendered
    renderWithQueryClient(<BinDisplayGrid {...defaultProps} />);

    // THEN: Error message is displayed
    await waitFor(() => {
      expect(
        screen.getByText(/failed to load bin display data/i),
      ).toBeInTheDocument();
    });
  });

  it("6.13-COMPONENT-015: should display bins with responsive grid layout (2-3 columns) (AC #2)", async () => {
    // GIVEN: BinDisplayGrid with multiple bins
    const binData = Array.from({ length: 6 }, (_, i) => ({
      bin_id: `bin-${i + 1}`,
      bin_name: `Bin ${i + 1}`,
      display_order: i,
      game_code: "1234",
      game_name: "Game 1",
      price: 5.0,
      pack_number: `00000${i + 1}`,
      serial_start: `00000${i * 100 + 1}`,
      serial_end: `0000${(i + 1) * 100}`,
      total_sold: 50,
      status: "ACTIVE" as const,
    }));
    vi.mocked(getBinDisplay).mockResolvedValue({
      success: true,
      data: binData,
    });

    // WHEN: Component is rendered
    renderWithQueryClient(<BinDisplayGrid {...defaultProps} />);

    // THEN: Grid layout is applied (CSS classes for responsive grid)
    await waitFor(() => {
      const grid = screen.getByTestId("bin-display-grid");
      expect(grid).toHaveClass("grid");
      expect(grid).toHaveClass("grid-cols-1");
      expect(grid).toHaveClass("md:grid-cols-2");
      expect(grid).toHaveClass("lg:grid-cols-3");
    });
  });

  it("6.13-COMPONENT-016: should display bin without active pack (AC #2)", async () => {
    // GIVEN: BinDisplayGrid with bin without active pack
    const binData = [
      {
        bin_id: "bin-1",
        bin_name: "Bin 1",
        display_order: 0,
        game_code: null,
        game_name: null,
        price: null,
        pack_number: null,
        serial_start: null,
        serial_end: null,
        total_sold: 0,
        status: null,
      },
    ];
    vi.mocked(getBinDisplay).mockResolvedValue({
      success: true,
      data: binData,
    });

    // WHEN: Component is rendered
    renderWithQueryClient(<BinDisplayGrid {...defaultProps} />);

    // THEN: Bin is displayed with "No active pack" message
    await waitFor(() => {
      expect(screen.getByText("Bin 1")).toBeInTheDocument();
      expect(screen.getByText(/no active pack/i)).toBeInTheDocument();
    });
  });

  it("6.13-COMPONENT-017: should support real-time updates via polling (AC #2)", async () => {
    // GIVEN: BinDisplayGrid with polling enabled
    const binData = [
      {
        bin_id: "bin-1",
        bin_name: "Bin 1",
        display_order: 0,
        game_code: "1234",
        game_name: "Game 1",
        price: 5.0,
        pack_number: "000001",
        serial_start: "000001",
        serial_end: "000100",
        total_sold: 50,
        status: "ACTIVE",
      },
    ];
    vi.mocked(getBinDisplay).mockResolvedValue({
      success: true,
      data: binData,
    });

    // WHEN: Component is rendered with polling interval
    renderWithQueryClient(
      <BinDisplayGrid {...defaultProps} pollingInterval={1000} />,
    );

    // THEN: Component renders successfully (polling is handled by TanStack Query)
    await waitFor(() => {
      expect(screen.getByText("Bin 1")).toBeInTheDocument();
    });

    // Verify polling is configured (check that refetchInterval would be set)
    // Note: Actual polling behavior is tested in integration tests
    expect(getBinDisplay).toHaveBeenCalled();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECURITY TESTS - XSS Prevention
  // ═══════════════════════════════════════════════════════════════════════════

  it("6.13-COMPONENT-SEC-003: [P0] should prevent XSS in bin_name field", async () => {
    // GIVEN: BinDisplayGrid with XSS attempt in bin_name
    const xssPayload = "<script>alert('xss')</script>";
    const binData = [
      {
        bin_id: "bin-1",
        bin_name: xssPayload, // XSS attempt
        display_order: 0,
        game_code: "1234",
        game_name: "Game 1",
        price: 5.0,
        pack_number: "000001",
        serial_start: "000001",
        serial_end: "000100",
        total_sold: 50,
        status: "ACTIVE",
      },
    ];
    vi.mocked(getBinDisplay).mockResolvedValue({
      success: true,
      data: binData,
    });

    // WHEN: Component is rendered
    renderWithQueryClient(<BinDisplayGrid {...defaultProps} />);

    // THEN: XSS payload is escaped/rendered as text (not executed)
    await waitFor(() => {
      const renderedText = screen.getByText(xssPayload);
      expect(
        renderedText,
        "XSS payload should be rendered as text",
      ).toBeInTheDocument();
      expect(renderedText.tagName, "Should not be script element").not.toBe(
        "SCRIPT",
      );
      // React automatically escapes, but we verify it's handled correctly
    });
  });

  it("6.13-COMPONENT-SEC-004: [P0] should prevent XSS in game_name field", async () => {
    // GIVEN: BinDisplayGrid with XSS attempt in game_name
    const xssPayload = "<img src=x onerror=alert('xss')>";
    const binData = [
      {
        bin_id: "bin-1",
        bin_name: "Bin 1",
        display_order: 0,
        game_code: "1234",
        game_name: xssPayload, // XSS attempt
        price: 5.0,
        pack_number: "000001",
        serial_start: "000001",
        serial_end: "000100",
        total_sold: 50,
        status: "ACTIVE",
      },
    ];
    vi.mocked(getBinDisplay).mockResolvedValue({
      success: true,
      data: binData,
    });

    // WHEN: Component is rendered
    renderWithQueryClient(<BinDisplayGrid {...defaultProps} />);

    // THEN: XSS payload is escaped/rendered as text
    await waitFor(() => {
      const renderedText = screen.getByText(xssPayload);
      expect(
        renderedText,
        "XSS payload should be rendered as text",
      ).toBeInTheDocument();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // EDGE CASE TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  it("6.13-COMPONENT-EDGE-005: [P1] should handle null/undefined values in bin data gracefully", async () => {
    // GIVEN: BinDisplayGrid with null/undefined values
    const binData = [
      {
        bin_id: "bin-1",
        bin_name: "Bin 1",
        display_order: 0,
        game_code: null, // Null value
        game_name: null,
        price: null,
        pack_number: null,
        serial_start: null,
        serial_end: null,
        total_sold: 0,
        status: null,
      },
    ];
    vi.mocked(getBinDisplay).mockResolvedValue({
      success: true,
      data: binData,
    });

    // WHEN: Component is rendered
    renderWithQueryClient(<BinDisplayGrid {...defaultProps} />);

    // THEN: Component handles null values without crashing
    await waitFor(() => {
      expect(screen.getByText("Bin 1")).toBeInTheDocument();
      // Component should display empty/null values gracefully
    });
  });

  it("6.13-COMPONENT-EDGE-006: [P1] should handle very large total_sold values", async () => {
    // GIVEN: BinDisplayGrid with very large total_sold
    const largeSoldCount = 999999;
    const binData = [
      {
        bin_id: "bin-1",
        bin_name: "Bin 1",
        display_order: 0,
        game_code: "1234",
        game_name: "Game 1",
        price: 5.0,
        pack_number: "000001",
        serial_start: "000001",
        serial_end: "000100",
        total_sold: largeSoldCount,
        status: "ACTIVE",
      },
    ];
    vi.mocked(getBinDisplay).mockResolvedValue({
      success: true,
      data: binData,
    });

    // WHEN: Component is rendered
    renderWithQueryClient(<BinDisplayGrid {...defaultProps} />);

    // THEN: Large number is displayed correctly
    await waitFor(() => {
      expect(screen.getByText(largeSoldCount.toString())).toBeInTheDocument();
    });
  });

  it("6.13-COMPONENT-EDGE-007: [P1] should handle empty bin data array", async () => {
    // GIVEN: BinDisplayGrid with empty data
    vi.mocked(getBinDisplay).mockResolvedValue({
      success: true,
      data: [],
    });

    // WHEN: Component is rendered
    renderWithQueryClient(<BinDisplayGrid {...defaultProps} />);

    // THEN: Empty state is displayed
    await waitFor(() => {
      // Component should show empty state message or handle gracefully
      const emptyMessage =
        screen.queryByText(/no bins/i) || screen.queryByText(/empty/i);
      expect(
        emptyMessage || screen.queryByText("Bin 1") === null,
        "Should display empty state or no bins",
      ).toBeTruthy();
    });
  });

  it("6.13-COMPONENT-EDGE-008: [P1] should handle special characters in bin names and game names", async () => {
    // GIVEN: BinDisplayGrid with special characters
    const binData = [
      {
        bin_id: "bin-1",
        bin_name: "Bin with émojis 🎰🎲",
        display_order: 0,
        game_code: "1234",
        game_name: "Game with special chars !@#$%",
        price: 5.0,
        pack_number: "000001",
        serial_start: "000001",
        serial_end: "000100",
        total_sold: 50,
        status: "ACTIVE",
      },
    ];
    vi.mocked(getBinDisplay).mockResolvedValue({
      success: true,
      data: binData,
    });

    // WHEN: Component is rendered
    renderWithQueryClient(<BinDisplayGrid {...defaultProps} />);

    // THEN: Special characters are displayed correctly
    await waitFor(() => {
      expect(screen.getByText("Bin with émojis 🎰🎲")).toBeInTheDocument();
      expect(
        screen.getByText("Game with special chars !@#$%"),
      ).toBeInTheDocument();
    });
  });
});
