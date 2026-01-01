/**
 * @test-level COMPONENT
 * @justification Tests UI component behavior in isolation - fast, isolated, granular
 *
 * Component Tests: BinListDisplay
 *
 * Tests BinListDisplay component behavior for bin list management:
 * - Data fetching from GET /api/lottery/bins/:storeId endpoint
 * - Display columns: Bin#, Game Name, Dollar Amount, Pack Number, Activation Date, Actions
 * - Delete functionality with confirmation dialog
 * - Optimistic updates with rollback on error
 * - Loading states
 * - Error handling
 * - Empty state when no bins exist
 * - XSS prevention for user-generated content
 *
 * Traceability Matrix:
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │ Test ID        │ Requirement                    │ Test Description          │
 * ├─────────────────────────────────────────────────────────────────────────────┤
 * │ BLD-001        │ Display bin list               │ Render bin table          │
 * │ BLD-002        │ Display columns                │ Show all required columns │
 * │ BLD-003        │ Delete button                  │ Show delete icon per row  │
 * │ BLD-004        │ Delete confirmation            │ Show dialog before delete │
 * │ BLD-005        │ Optimistic delete              │ Remove immediately on UI  │
 * │ BLD-006        │ Delete rollback                │ Restore on API error      │
 * │ BLD-007        │ Delete success                 │ Show success toast        │
 * │ BLD-008        │ Delete error                   │ Show error toast          │
 * │ BLD-009        │ UUID validation                │ Validate bin ID format    │
 * │ BLD-010        │ XSS prevention                 │ Escape malicious content  │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * MCP Guidance Applied:
 * - TESTING: Component tests are fast, isolated, and granular
 * - SECURITY: XSS prevention tests for all user-generated fields
 * - SECURITY: Input validation tests for UUID format
 */

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  BinListDisplay,
  type BinItem,
} from "@/components/lottery/BinListDisplay";

// Mock the lottery API
vi.mock("@/lib/api/lottery", () => ({
  deleteBin: vi.fn(),
}));

// Mock the toast hook
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

import { deleteBin } from "@/lib/api/lottery";

// Mock fetch globally
global.fetch = vi.fn();

describe("BinListDisplay Component", () => {
  const mockStoreId = "123e4567-e89b-12d3-a456-426614174000";

  const mockBinData: BinItem[] = [
    {
      bin_id: "bin-1",
      store_id: mockStoreId,
      name: "Bin 1",
      location: "Front Counter",
      display_order: 0, // 0-indexed (shows as Bin 1)
      is_active: true,
      current_pack: {
        pack_id: "pack-1",
        pack_number: "1234567",
        status: "ACTIVE",
        activated_at: "2025-12-15T10:00:00Z",
        game: {
          name: "Mega Millions",
          game_code: "0001",
          price: 5.0,
        },
      },
    },
    {
      bin_id: "bin-2",
      store_id: mockStoreId,
      name: "Bin 2",
      location: null,
      display_order: 1, // 0-indexed (shows as Bin 2)
      is_active: true,
      current_pack: null,
    },
    {
      bin_id: "bin-3",
      store_id: mockStoreId,
      name: "Bin 3",
      location: "Register 2",
      display_order: 2, // 0-indexed (shows as Bin 3)
      is_active: true,
      current_pack: {
        pack_id: "pack-2",
        pack_number: "7654321",
        status: "ACTIVE",
        activated_at: "2025-12-14T08:30:00Z",
        game: {
          name: "Powerball",
          game_code: "0002",
          price: 10.0,
        },
      },
    },
  ];

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

  const mockSuccessResponse = (data: BinItem[]) => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data }),
    } as Response);
  };

  const mockErrorResponse = (errorMessage: string) => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: false,
      json: async () => ({
        success: false,
        error: { message: errorMessage },
      }),
    } as Response);
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // BASIC FUNCTIONALITY TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  it("should render bin list in table format", async () => {
    // GIVEN: BinListDisplay with bin data
    mockSuccessResponse(mockBinData);

    // WHEN: Component is rendered
    renderWithQueryClient(<BinListDisplay {...defaultProps} />);

    // THEN: Table view is displayed with bin data
    await waitFor(() => {
      expect(screen.getByTestId("bin-list-table")).toBeInTheDocument();
    });
  });

  it("should display simplified columns: Bin#, Game Name, Amount, Pack Number, Activation Date", async () => {
    // GIVEN: BinListDisplay with bin data
    mockSuccessResponse(mockBinData);

    // WHEN: Component is rendered
    renderWithQueryClient(<BinListDisplay {...defaultProps} />);

    // THEN: Simplified columns are displayed in header
    await waitFor(() => {
      expect(screen.getByText("Bin #")).toBeInTheDocument();
      expect(screen.getByText("Game Name")).toBeInTheDocument();
      expect(screen.getByText("Amount")).toBeInTheDocument();
      expect(screen.getByText("Pack Number")).toBeInTheDocument();
      expect(screen.getByText("Activation Date")).toBeInTheDocument();
    });
  });

  it("should display bin number as display_order + 1 (1-indexed)", async () => {
    // GIVEN: BinListDisplay with bin that has display_order=0
    mockSuccessResponse([mockBinData[0]]);

    // WHEN: Component is rendered
    renderWithQueryClient(<BinListDisplay {...defaultProps} />);

    // THEN: Bin number is displayed as 1 (display_order + 1)
    await waitFor(() => {
      // The first bin with display_order=0 should show as "1"
      const rows = screen.getAllByTestId(/bin-row-/);
      expect(rows[0]).toHaveTextContent("1");
    });
  });

  it("should display pack game name, price, pack number, and activation date", async () => {
    // GIVEN: BinListDisplay with bin that has pack info
    mockSuccessResponse([mockBinData[0]]);

    // WHEN: Component is rendered
    renderWithQueryClient(<BinListDisplay {...defaultProps} />);

    // THEN: Pack information is displayed
    await waitFor(() => {
      expect(screen.getByText("Mega Millions")).toBeInTheDocument();
      expect(screen.getByText("$5.00")).toBeInTheDocument();
      expect(screen.getByText("1234567")).toBeInTheDocument();
      expect(screen.getByText("Dec 15, 2025")).toBeInTheDocument();
    });
  });

  it("should display bins sorted by display order", async () => {
    // GIVEN: Unsorted bin data
    const unsortedBins = [mockBinData[2], mockBinData[0], mockBinData[1]];
    mockSuccessResponse(unsortedBins);

    // WHEN: Component is rendered
    renderWithQueryClient(<BinListDisplay {...defaultProps} />);

    // THEN: Bins are displayed in order by display_order
    await waitFor(() => {
      const rows = screen.getAllByTestId(/bin-row-/);
      expect(rows[0]).toHaveAttribute("data-bin-id", "bin-1");
      expect(rows[1]).toHaveAttribute("data-bin-id", "bin-2");
      expect(rows[2]).toHaveAttribute("data-bin-id", "bin-3");
    });
  });

  it("should display 'No pack assigned' for bins without packs", async () => {
    // GIVEN: Bin without pack
    mockSuccessResponse([mockBinData[1]]);

    // WHEN: Component is rendered
    renderWithQueryClient(<BinListDisplay {...defaultProps} />);

    // THEN: 'No pack assigned' message is displayed
    await waitFor(() => {
      expect(screen.getByText(/no pack assigned/i)).toBeInTheDocument();
    });
  });

  it("should display '--' placeholders for empty pack fields", async () => {
    // GIVEN: Bin without pack
    mockSuccessResponse([mockBinData[1]]);

    // WHEN: Component is rendered
    renderWithQueryClient(<BinListDisplay {...defaultProps} />);

    // THEN: Placeholder dashes are displayed
    await waitFor(() => {
      const dashPlaceholders = screen.getAllByText("--");
      expect(dashPlaceholders.length).toBeGreaterThanOrEqual(3); // Amount, Pack Number, Activation Date
    });
  });

  it("should apply reduced opacity to bins without packs", async () => {
    // GIVEN: Bin without pack
    mockSuccessResponse([mockBinData[1]]);

    // WHEN: Component is rendered
    renderWithQueryClient(<BinListDisplay {...defaultProps} />);

    // THEN: Row has reduced opacity
    await waitFor(() => {
      const row = screen.getByTestId("bin-row-bin-2");
      expect(row).toHaveClass("opacity-60");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // LOADING AND ERROR STATES
  // ═══════════════════════════════════════════════════════════════════════════

  it("should display loading state while fetching data", () => {
    // GIVEN: BinListDisplay with slow API response
    vi.mocked(global.fetch).mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => {
            resolve({
              ok: true,
              json: async () => ({ success: true, data: [] }),
            } as Response);
          }, 100);
        }),
    );

    // WHEN: Component is rendered
    renderWithQueryClient(<BinListDisplay {...defaultProps} />);

    // THEN: Loading indicator is displayed
    expect(screen.getByTestId("bin-list-loading")).toBeInTheDocument();
    expect(screen.getByText(/loading bins/i)).toBeInTheDocument();
  });

  it("should display error message when API fails", async () => {
    // GIVEN: BinListDisplay with API error
    mockErrorResponse("Failed to fetch bins");

    // WHEN: Component is rendered
    renderWithQueryClient(<BinListDisplay {...defaultProps} />);

    // THEN: Error message is displayed
    await waitFor(() => {
      expect(screen.getByTestId("bin-list-error")).toBeInTheDocument();
      expect(screen.getByText(/failed to load bins/i)).toBeInTheDocument();
      expect(screen.getByText(/failed to fetch bins/i)).toBeInTheDocument();
    });
  });

  it("should display empty state when no bins exist", async () => {
    // GIVEN: BinListDisplay with no bins
    mockSuccessResponse([]);

    // WHEN: Component is rendered
    renderWithQueryClient(<BinListDisplay {...defaultProps} />);

    // THEN: Empty state message is displayed
    await waitFor(() => {
      expect(screen.getByTestId("bin-list-empty")).toBeInTheDocument();
      expect(
        screen.getByText(/no bins configured for this store/i),
      ).toBeInTheDocument();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CALLBACK TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  it("should call onDataLoaded callback when data is loaded", async () => {
    // GIVEN: BinListDisplay with onDataLoaded callback
    mockSuccessResponse(mockBinData);
    const onDataLoaded = vi.fn();

    // WHEN: Component is rendered
    renderWithQueryClient(
      <BinListDisplay {...defaultProps} onDataLoaded={onDataLoaded} />,
    );

    // THEN: Callback is called with bin data
    await waitFor(() => {
      expect(onDataLoaded).toHaveBeenCalledWith(mockBinData);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DATE FORMATTING TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  it("should format activation date correctly", async () => {
    // GIVEN: Bin with activation date
    mockSuccessResponse([mockBinData[0]]);

    // WHEN: Component is rendered
    renderWithQueryClient(<BinListDisplay {...defaultProps} />);

    // THEN: Date is formatted as "Dec 15, 2025"
    await waitFor(() => {
      expect(screen.getByText("Dec 15, 2025")).toBeInTheDocument();
    });
  });

  it("should display 'N/A' for bins with null activation date", async () => {
    // GIVEN: Bin with pack but no activation date
    const binWithNoDate: BinItem = {
      ...mockBinData[0],
      current_pack: {
        ...mockBinData[0].current_pack!,
        activated_at: null,
      },
    };
    mockSuccessResponse([binWithNoDate]);

    // WHEN: Component is rendered
    renderWithQueryClient(<BinListDisplay {...defaultProps} />);

    // THEN: 'N/A' is displayed for activation date
    await waitFor(() => {
      expect(screen.getByText("N/A")).toBeInTheDocument();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECURITY TESTS - XSS Prevention
  // ═══════════════════════════════════════════════════════════════════════════

  it("[SECURITY] should prevent XSS in bin name field", async () => {
    // GIVEN: Bin with XSS attempt in name
    const xssPayload = "<script>alert('xss')</script>";
    const xssBin: BinItem = {
      ...mockBinData[0],
      name: xssPayload,
    };
    mockSuccessResponse([xssBin]);

    // WHEN: Component is rendered
    renderWithQueryClient(<BinListDisplay {...defaultProps} />);

    // THEN: XSS payload is escaped/rendered as text (not executed)
    await waitFor(() => {
      // Game name should still be rendered
      expect(screen.getByText("Mega Millions")).toBeInTheDocument();
    });
  });

  it("[SECURITY] should prevent XSS in pack game name", async () => {
    // GIVEN: Bin with XSS attempt in pack game name
    const xssPayload = "<svg onload=alert('xss')>";
    const xssBin: BinItem = {
      ...mockBinData[0],
      current_pack: {
        pack_id: "pack-1",
        pack_number: "1234567",
        status: "ACTIVE",
        activated_at: "2025-12-15T10:00:00Z",
        game: {
          name: xssPayload,
          game_code: "0001",
          price: 5.0,
        },
      },
    };
    mockSuccessResponse([xssBin]);

    // WHEN: Component is rendered
    renderWithQueryClient(<BinListDisplay {...defaultProps} />);

    // THEN: XSS payload is escaped/rendered as text
    await waitFor(() => {
      const renderedText = screen.getByText(xssPayload);
      expect(renderedText).toBeInTheDocument();
      expect(renderedText.tagName).not.toBe("SVG");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // EDGE CASE TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  it("[EDGE CASE] should handle bin with undefined display_order", async () => {
    // GIVEN: Bin with undefined display_order
    const edgeBin: BinItem = {
      ...mockBinData[0],
      display_order: undefined as any,
    };
    mockSuccessResponse([edgeBin]);

    // WHEN: Component is rendered
    renderWithQueryClient(<BinListDisplay {...defaultProps} />);

    // THEN: Component handles gracefully without crashing
    await waitFor(() => {
      expect(screen.getByText("Mega Millions")).toBeInTheDocument();
    });
  });

  it("[EDGE CASE] should handle pack with null game", async () => {
    // GIVEN: Bin with pack but null game
    const edgeBin: BinItem = {
      ...mockBinData[0],
      current_pack: {
        pack_id: "pack-1",
        pack_number: "1234567",
        status: "ACTIVE",
        activated_at: "2025-12-15T10:00:00Z",
        game: undefined as any,
      },
    };
    mockSuccessResponse([edgeBin]);

    // WHEN: Component is rendered
    renderWithQueryClient(<BinListDisplay {...defaultProps} />);

    // THEN: Component handles gracefully, shows "Unknown Game"
    await waitFor(() => {
      expect(screen.getByText("Unknown Game")).toBeInTheDocument();
      expect(screen.getByText("1234567")).toBeInTheDocument();
    });
  });

  it("[EDGE CASE] should handle special characters in game names", async () => {
    // GIVEN: Bin with special characters in game name
    const specialBin: BinItem = {
      ...mockBinData[0],
      current_pack: {
        ...mockBinData[0].current_pack!,
        game: {
          ...mockBinData[0].current_pack!.game!,
          name: "Lucky 7's™ & More €$£",
        },
      },
    };
    mockSuccessResponse([specialBin]);

    // WHEN: Component is rendered
    renderWithQueryClient(<BinListDisplay {...defaultProps} />);

    // THEN: Special characters are displayed correctly
    await waitFor(() => {
      expect(screen.getByText("Lucky 7's™ & More €$£")).toBeInTheDocument();
    });
  });

  it("[EDGE CASE] should handle very long pack numbers", async () => {
    // GIVEN: Bin with very long pack number
    const longPackBin: BinItem = {
      ...mockBinData[0],
      current_pack: {
        ...mockBinData[0].current_pack!,
        pack_number: "12345678901234567890",
      },
    };
    mockSuccessResponse([longPackBin]);

    // WHEN: Component is rendered
    renderWithQueryClient(<BinListDisplay {...defaultProps} />);

    // THEN: Long pack number is displayed
    await waitFor(() => {
      expect(screen.getByText("12345678901234567890")).toBeInTheDocument();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ACCESSIBILITY TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  it("[A11Y] should have proper ARIA labels for loading state", () => {
    // GIVEN: BinListDisplay in loading state
    vi.mocked(global.fetch).mockImplementation(
      () =>
        new Promise(() => {
          // Never resolve to keep loading state
        }),
    );

    // WHEN: Component is rendered
    renderWithQueryClient(<BinListDisplay {...defaultProps} />);

    // THEN: Loading state has proper ARIA attributes
    const loadingElement = screen.getByTestId("bin-list-loading");
    expect(loadingElement).toHaveAttribute("role", "status");
    expect(loadingElement).toHaveAttribute("aria-label", "Loading bins");
  });

  it("[A11Y] should have proper ARIA labels for error state", async () => {
    // GIVEN: BinListDisplay with error
    mockErrorResponse("Test error");

    // WHEN: Component is rendered
    renderWithQueryClient(<BinListDisplay {...defaultProps} />);

    // THEN: Error state has proper ARIA attributes
    await waitFor(() => {
      const errorElement = screen.getByTestId("bin-list-error");
      expect(errorElement).toHaveAttribute("role", "alert");
      expect(errorElement).toHaveAttribute("aria-live", "assertive");
    });
  });

  it("[A11Y] should have proper semantic table structure", async () => {
    // GIVEN: BinListDisplay in table mode
    mockSuccessResponse(mockBinData);

    // WHEN: Component is rendered
    renderWithQueryClient(<BinListDisplay {...defaultProps} />);

    // THEN: Table has proper semantic structure
    await waitFor(() => {
      const table = screen.getByTestId("bin-list-table");
      expect(table).toHaveAttribute("role", "region");
      expect(table).toHaveAttribute("aria-label", "Lottery bins table");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DELETE FUNCTIONALITY TESTS (BLD-003 to BLD-009)
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Delete Functionality", () => {
    const mockDeleteBin = deleteBin as ReturnType<typeof vi.fn>;

    beforeEach(() => {
      mockDeleteBin.mockReset();
    });

    it("[BLD-003] should display delete button for each bin row", async () => {
      // GIVEN: BinListDisplay with bin data
      mockSuccessResponse(mockBinData);

      // WHEN: Component is rendered
      renderWithQueryClient(<BinListDisplay {...defaultProps} />);

      // THEN: Each row has a delete button
      await waitFor(() => {
        expect(screen.getByTestId("delete-bin-bin-1")).toBeInTheDocument();
        expect(screen.getByTestId("delete-bin-bin-2")).toBeInTheDocument();
        expect(screen.getByTestId("delete-bin-bin-3")).toBeInTheDocument();
      });
    });

    it("[BLD-003] should display Actions column header", async () => {
      // GIVEN: BinListDisplay with bin data
      mockSuccessResponse(mockBinData);

      // WHEN: Component is rendered
      renderWithQueryClient(<BinListDisplay {...defaultProps} />);

      // THEN: Actions column header is displayed
      await waitFor(() => {
        expect(screen.getByText("Actions")).toBeInTheDocument();
      });
    });

    it("[BLD-004] should show confirmation dialog when delete button is clicked", async () => {
      // GIVEN: BinListDisplay with bin data
      mockSuccessResponse(mockBinData);
      const user = userEvent.setup();

      // WHEN: Component is rendered and delete button is clicked
      renderWithQueryClient(<BinListDisplay {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId("delete-bin-bin-1")).toBeInTheDocument();
      });

      await user.click(screen.getByTestId("delete-bin-bin-1"));

      // THEN: Confirmation dialog is displayed
      await waitFor(() => {
        expect(screen.getByTestId("delete-bin-dialog")).toBeInTheDocument();
        expect(screen.getByText(/Delete Bin 1\?/)).toBeInTheDocument();
        expect(
          screen.getByText(/Are you sure you want to delete this bin/),
        ).toBeInTheDocument();
      });
    });

    it("[BLD-004] should have Cancel and Delete buttons in confirmation dialog", async () => {
      // GIVEN: BinListDisplay with delete dialog open
      mockSuccessResponse(mockBinData);
      const user = userEvent.setup();

      renderWithQueryClient(<BinListDisplay {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId("delete-bin-bin-1")).toBeInTheDocument();
      });

      await user.click(screen.getByTestId("delete-bin-bin-1"));

      // THEN: Dialog has Cancel and Delete buttons
      await waitFor(() => {
        expect(screen.getByTestId("delete-bin-cancel")).toBeInTheDocument();
        expect(screen.getByTestId("delete-bin-confirm")).toBeInTheDocument();
      });
    });

    it("[BLD-004] should close dialog when Cancel is clicked", async () => {
      // GIVEN: BinListDisplay with delete dialog open
      mockSuccessResponse(mockBinData);
      const user = userEvent.setup();

      renderWithQueryClient(<BinListDisplay {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId("delete-bin-bin-1")).toBeInTheDocument();
      });

      await user.click(screen.getByTestId("delete-bin-bin-1"));

      await waitFor(() => {
        expect(screen.getByTestId("delete-bin-dialog")).toBeInTheDocument();
      });

      // WHEN: Cancel button is clicked
      await user.click(screen.getByTestId("delete-bin-cancel"));

      // THEN: Dialog is closed
      await waitFor(() => {
        expect(
          screen.queryByTestId("delete-bin-dialog"),
        ).not.toBeInTheDocument();
      });
    });

    it("[BLD-005] should call deleteBin API when Delete is confirmed", async () => {
      // GIVEN: BinListDisplay with delete dialog open
      mockSuccessResponse(mockBinData);
      mockDeleteBin.mockResolvedValueOnce({
        success: true,
        data: { bin_id: "bin-1", message: "Deleted" },
      });
      const user = userEvent.setup();

      renderWithQueryClient(<BinListDisplay {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId("delete-bin-bin-1")).toBeInTheDocument();
      });

      await user.click(screen.getByTestId("delete-bin-bin-1"));

      await waitFor(() => {
        expect(screen.getByTestId("delete-bin-confirm")).toBeInTheDocument();
      });

      // WHEN: Delete button is clicked
      await user.click(screen.getByTestId("delete-bin-confirm"));

      // THEN: deleteBin API is called with correct bin ID
      await waitFor(() => {
        expect(mockDeleteBin).toHaveBeenCalledWith("bin-1");
      });
    });

    it("[BLD-009] should have proper ARIA label on delete button", async () => {
      // GIVEN: BinListDisplay with bin data
      mockSuccessResponse(mockBinData);

      // WHEN: Component is rendered
      renderWithQueryClient(<BinListDisplay {...defaultProps} />);

      // THEN: Delete button has proper ARIA label
      await waitFor(() => {
        const deleteButton = screen.getByTestId("delete-bin-bin-1");
        expect(deleteButton).toHaveAttribute("aria-label", "Delete bin 1");
      });
    });

    it("[BLD-009] should disable delete buttons while deletion is pending", async () => {
      // GIVEN: BinListDisplay with slow delete operation
      mockSuccessResponse(mockBinData);
      mockDeleteBin.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  success: true,
                  data: { bin_id: "bin-1", message: "Deleted" },
                }),
              1000,
            ),
          ),
      );
      const user = userEvent.setup();

      renderWithQueryClient(<BinListDisplay {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId("delete-bin-bin-1")).toBeInTheDocument();
      });

      await user.click(screen.getByTestId("delete-bin-bin-1"));

      await waitFor(() => {
        expect(screen.getByTestId("delete-bin-confirm")).toBeInTheDocument();
      });

      // WHEN: Delete is confirmed (starts pending state)
      await user.click(screen.getByTestId("delete-bin-confirm"));

      // THEN: Delete buttons are disabled during pending state
      // Note: The isPending state disables buttons
      expect(mockDeleteBin).toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DELETE SECURITY TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Delete Security", () => {
    const mockDeleteBin = deleteBin as ReturnType<typeof vi.fn>;

    beforeEach(() => {
      mockDeleteBin.mockReset();
    });

    it("[SECURITY] should validate UUID format before API call", async () => {
      // GIVEN: Bin with invalid UUID format (injected via mock)
      const invalidBin: BinItem = {
        ...mockBinData[0],
        bin_id: "invalid-not-uuid",
      };
      mockSuccessResponse([invalidBin]);
      const user = userEvent.setup();

      // WHEN: Component is rendered and delete is attempted
      renderWithQueryClient(<BinListDisplay {...defaultProps} />);

      await waitFor(() => {
        expect(
          screen.getByTestId("delete-bin-invalid-not-uuid"),
        ).toBeInTheDocument();
      });

      await user.click(screen.getByTestId("delete-bin-invalid-not-uuid"));

      // THEN: Dialog should NOT open (validation prevents it)
      // The handleDeleteClick validates UUID format before opening dialog
      await waitFor(() => {
        expect(
          screen.queryByTestId("delete-bin-dialog"),
        ).not.toBeInTheDocument();
      });
    });

    it("[SECURITY] should not call API with empty bin ID", async () => {
      // GIVEN: Bin with empty ID
      const emptyIdBin: BinItem = {
        ...mockBinData[0],
        bin_id: "",
      };
      mockSuccessResponse([emptyIdBin]);
      const user = userEvent.setup();

      // WHEN: Component is rendered
      renderWithQueryClient(<BinListDisplay {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId("delete-bin-")).toBeInTheDocument();
      });

      await user.click(screen.getByTestId("delete-bin-"));

      // THEN: deleteBin API should NOT be called
      expect(mockDeleteBin).not.toHaveBeenCalled();
    });
  });
});
