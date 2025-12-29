/**
 * PackSearchCombobox Component Tests
 *
 * Test file for PackSearchCombobox component used in lottery pack activation.
 * This component provides debounced search functionality for selecting lottery packs.
 *
 * ============================================================================
 * TRACEABILITY MATRIX
 * ============================================================================
 * | Test ID                    | Requirement              | Category         |
 * |----------------------------|--------------------------|------------------|
 * | PSC-001                    | Render combobox UI       | Component        |
 * | PSC-002                    | Render with custom props | Component        |
 * | PSC-003                    | Show recent packs focus  | Business Logic   |
 * | PSC-004                    | Debounced search 2+ char | Business Logic   |
 * | PSC-005                    | Display search results   | Assertions       |
 * | PSC-006                    | Selection callback       | Integration      |
 * | PSC-007                    | Keyboard navigation      | Accessibility    |
 * | PSC-008                    | ARIA attributes          | Accessibility    |
 * | PSC-009                    | Loading states           | Edge Cases       |
 * | PSC-010                    | Empty state handling     | Edge Cases       |
 * | PSC-011                    | Clear selection on edit  | Business Logic   |
 * | PSC-012                    | Dropdown close outside   | Edge Cases       |
 * | PSC-013                    | Special chars in search  | Security         |
 * | PSC-014                    | XSS prevention output    | Security         |
 * | PSC-015                    | Expose focus via ref     | Integration      |
 * | PSC-016                    | Expose clear via ref     | Integration      |
 * | PSC-017                    | Clear selection via ref  | Business Logic   |
 * ============================================================================
 *
 * Key Features Tested:
 * - Debounced search (500ms) for game name or pack number
 * - Recent packs shown on focus before typing
 * - Minimum 2 character requirement for search mode
 * - Keyboard navigation (arrow keys, enter, escape)
 * - Selection handling with callback
 * - Loading and empty states
 * - Accessibility (ARIA attributes)
 *
 * MCP Guidance Applied:
 * - FE-002: FORM_VALIDATION - Input length validation before search
 * - SEC-014: INPUT_VALIDATION - Sanitized input
 * - SEC-004: XSS - React auto-escapes output (validated)
 *
 * @story Pack Activation UX Enhancement
 * @priority P0 (Critical - Core Feature)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  PackSearchCombobox,
  type PackSearchOption,
} from "@/components/lottery/PackSearchCombobox";
import * as useLotteryModule from "@/hooks/useLottery";

// Mock the lottery hooks
vi.mock("@/hooks/useLottery", () => ({
  useLotteryPacks: vi.fn(),
  usePackSearch: vi.fn(),
}));

// Mock useDebounce to return immediate value for testing
vi.mock("@/hooks/useDebounce", () => ({
  useDebounce: vi.fn((value) => value),
}));

// Helper to create QueryClient wrapper
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  Wrapper.displayName = "TestQueryClientWrapper";
  return Wrapper;
}

// Helper to render with providers
function renderWithProviders(ui: React.ReactElement) {
  return render(ui, { wrapper: createWrapper() });
}

// Mock pack data
const mockPacks: PackSearchOption[] = [
  {
    pack_id: "pack-1",
    pack_number: "12345",
    game_id: "game-1",
    game_name: "Mega Millions",
    game_price: 2.0,
    serial_start: "001",
    serial_end: "150",
  },
  {
    pack_id: "pack-2",
    pack_number: "67890",
    game_id: "game-2",
    game_name: "Powerball",
    game_price: 3.0,
    serial_start: "001",
    serial_end: "100",
  },
];

// Mock API response format
const mockPacksApiResponse = mockPacks.map((p) => ({
  pack_id: p.pack_id,
  pack_number: p.pack_number,
  game_id: p.game_id,
  game: { name: p.game_name, price: p.game_price },
  serial_start: p.serial_start,
  serial_end: p.serial_end,
  status: "RECEIVED",
}));

// Setup mocks helper
function setupMocks(options?: {
  recentPacks?: typeof mockPacksApiResponse;
  searchPacks?: typeof mockPacksApiResponse;
  recentLoading?: boolean;
  searchLoading?: boolean;
}) {
  const {
    recentPacks = mockPacksApiResponse,
    searchPacks = mockPacksApiResponse,
    recentLoading = false,
    searchLoading = false,
  } = options || {};

  vi.mocked(useLotteryModule.useLotteryPacks).mockReturnValue({
    data: recentPacks,
    isLoading: recentLoading,
    isError: false,
    error: null,
  } as any);

  vi.mocked(useLotteryModule.usePackSearch).mockReturnValue({
    data: searchPacks,
    isLoading: searchLoading,
    isError: false,
    error: null,
  } as any);
}

describe("PackSearchCombobox", () => {
  const defaultProps = {
    storeId: "store-123",
    searchQuery: "",
    onSearchQueryChange: vi.fn(),
    onPackSelect: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    setupMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // ============================================================================
  // SECTION 1: COMPONENT RENDERING (PSC-001, PSC-002)
  // ============================================================================

  describe("Component Rendering", () => {
    it("PSC-001: should render combobox with default props", () => {
      renderWithProviders(<PackSearchCombobox {...defaultProps} />);

      expect(screen.getByRole("combobox")).toBeInTheDocument();
      expect(
        screen.getByPlaceholderText(/search by game name or pack number/i),
      ).toBeInTheDocument();
      expect(screen.getByText(/min 2 characters/i)).toBeInTheDocument();
    });

    it("PSC-002: should render with custom label and placeholder", () => {
      renderWithProviders(
        <PackSearchCombobox
          {...defaultProps}
          label="Select Pack"
          placeholder="Find a pack..."
        />,
      );

      expect(screen.getByText("Select Pack")).toBeInTheDocument();
      expect(screen.getByPlaceholderText("Find a pack...")).toBeInTheDocument();
    });

    it("should be disabled when disabled prop is true", () => {
      renderWithProviders(
        <PackSearchCombobox {...defaultProps} disabled={true} />,
      );

      expect(screen.getByRole("combobox")).toBeDisabled();
    });

    it("should display error message when error prop is provided", () => {
      renderWithProviders(
        <PackSearchCombobox
          {...defaultProps}
          error="Please select a valid pack"
        />,
      );

      expect(
        screen.getByText("Please select a valid pack"),
      ).toBeInTheDocument();
    });

    it("should render with testId prop for testing", () => {
      renderWithProviders(
        <PackSearchCombobox {...defaultProps} testId="pack-search-test" />,
      );

      expect(screen.getByTestId("pack-search-test")).toBeInTheDocument();
    });
  });

  // ============================================================================
  // SECTION 2: RECENT PACKS DISPLAY (PSC-003)
  // ============================================================================

  describe("Recent Packs Display", () => {
    it("PSC-003: should show recent packs when input is focused without typing", async () => {
      const user = userEvent.setup();
      renderWithProviders(<PackSearchCombobox {...defaultProps} />);

      const input = screen.getByRole("combobox");
      await user.click(input);

      await waitFor(() => {
        expect(screen.getByRole("listbox")).toBeInTheDocument();
        expect(screen.getByText(/recent received packs/i)).toBeInTheDocument();
        expect(screen.getByText("Mega Millions")).toBeInTheDocument();
        expect(screen.getByText("Powerball")).toBeInTheDocument();
      });
    });

    it("should show loading state while fetching recent packs", async () => {
      const user = userEvent.setup();
      setupMocks({ recentLoading: true });

      renderWithProviders(<PackSearchCombobox {...defaultProps} />);

      const input = screen.getByRole("combobox");
      await user.click(input);

      await waitFor(() => {
        expect(screen.getByText(/loading packs/i)).toBeInTheDocument();
      });
    });
  });

  // ============================================================================
  // SECTION 3: SEARCH BEHAVIOR (PSC-004, PSC-005)
  // ============================================================================

  describe("Search Behavior", () => {
    it("PSC-004: should switch to search mode when 2+ characters are in searchQuery", async () => {
      const user = userEvent.setup();
      const onSearchQueryChange = vi.fn();

      // Render with searchQuery of 2+ chars to enable search mode
      renderWithProviders(
        <PackSearchCombobox
          {...defaultProps}
          searchQuery="Me"
          onSearchQueryChange={onSearchQueryChange}
        />,
      );

      const input = screen.getByRole("combobox");
      await user.click(input);

      // Verify usePackSearch is called with search parameter
      await waitFor(() => {
        expect(useLotteryModule.usePackSearch).toHaveBeenCalledWith(
          "store-123",
          "Me",
          expect.objectContaining({ status: "RECEIVED" }),
          expect.objectContaining({ enabled: true }),
        );
      });
    });

    it("PSC-005: should display search results in dropdown", async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <PackSearchCombobox {...defaultProps} searchQuery="Mega" />,
      );

      const input = screen.getByRole("combobox");
      await user.click(input);

      await waitFor(() => {
        expect(screen.getByText("Mega Millions")).toBeInTheDocument();
        // Should not show recent packs header in search mode
        expect(
          screen.queryByText(/recent received packs/i),
        ).not.toBeInTheDocument();
      });
    });

    it("should show loading state while searching", async () => {
      const user = userEvent.setup();
      setupMocks({ searchLoading: true });

      renderWithProviders(
        <PackSearchCombobox {...defaultProps} searchQuery="Me" />,
      );

      const input = screen.getByRole("combobox");
      await user.click(input);

      await waitFor(() => {
        expect(screen.getByText(/searching packs/i)).toBeInTheDocument();
      });
    });

    it("PSC-010: should show empty state when no search results found", async () => {
      const user = userEvent.setup();
      setupMocks({ searchPacks: [] });

      renderWithProviders(
        <PackSearchCombobox {...defaultProps} searchQuery="NonExistent" />,
      );

      const input = screen.getByRole("combobox");
      await user.click(input);

      await waitFor(() => {
        expect(
          screen.getByText(/no received packs found/i),
        ).toBeInTheDocument();
      });
    });
  });

  // ============================================================================
  // SECTION 4: SELECTION BEHAVIOR (PSC-006, PSC-011)
  // ============================================================================

  describe("Selection Behavior", () => {
    it("PSC-006: should call onPackSelect when pack is selected", async () => {
      const user = userEvent.setup();
      const onPackSelect = vi.fn();

      renderWithProviders(
        <PackSearchCombobox {...defaultProps} onPackSelect={onPackSelect} />,
      );

      const input = screen.getByRole("combobox");
      await user.click(input);

      await waitFor(() => {
        expect(screen.getByText("Mega Millions")).toBeInTheDocument();
      });

      await user.click(screen.getByText("Mega Millions"));

      expect(onPackSelect).toHaveBeenCalledWith(
        expect.objectContaining({
          pack_id: "pack-1",
          game_name: "Mega Millions",
        }),
      );
    });

    it("should call onSearchQueryChange with display value when pack is selected", async () => {
      const user = userEvent.setup();
      const onSearchQueryChange = vi.fn();

      renderWithProviders(
        <PackSearchCombobox
          {...defaultProps}
          onSearchQueryChange={onSearchQueryChange}
        />,
      );

      const input = screen.getByRole("combobox");
      await user.click(input);

      await waitFor(() => {
        expect(screen.getByText("Mega Millions")).toBeInTheDocument();
      });

      await user.click(screen.getByText("Mega Millions"));

      // Should update search query with display value
      expect(onSearchQueryChange).toHaveBeenCalledWith(
        expect.stringContaining("Mega Millions"),
      );
    });

    it("should close dropdown after selection", async () => {
      const user = userEvent.setup();
      renderWithProviders(<PackSearchCombobox {...defaultProps} />);

      const input = screen.getByRole("combobox");
      await user.click(input);

      await waitFor(() => {
        expect(screen.getByRole("listbox")).toBeInTheDocument();
      });

      await user.click(screen.getByText("Mega Millions"));

      await waitFor(() => {
        expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
      });
    });

    it("PSC-011: should call onSearchQueryChange when user types (controlled by parent)", async () => {
      const user = userEvent.setup();
      const onSearchQueryChange = vi.fn();

      renderWithProviders(
        <PackSearchCombobox
          {...defaultProps}
          onSearchQueryChange={onSearchQueryChange}
        />,
      );

      const input = screen.getByRole("combobox");
      await user.type(input, "Power");

      // Parent is notified of each keystroke
      // Note: In controlled component, the callback receives the NEW input value
      // (what would be the result after typing each character)
      expect(onSearchQueryChange).toHaveBeenCalledTimes(5);
      // First keystroke "P" on empty input
      expect(onSearchQueryChange).toHaveBeenNthCalledWith(1, "P");
    });
  });

  // ============================================================================
  // SECTION 5: KEYBOARD NAVIGATION (PSC-007)
  // ============================================================================

  describe("Keyboard Navigation", () => {
    it("PSC-007: should navigate with arrow keys and select with Enter", async () => {
      const user = userEvent.setup();
      const onPackSelect = vi.fn();

      renderWithProviders(
        <PackSearchCombobox {...defaultProps} onPackSelect={onPackSelect} />,
      );

      const input = screen.getByRole("combobox");
      await user.click(input);

      await waitFor(() => {
        expect(screen.getByRole("listbox")).toBeInTheDocument();
      });

      // Navigate down
      await user.keyboard("{ArrowDown}");
      // Select with Enter
      await user.keyboard("{Enter}");

      expect(onPackSelect).toHaveBeenCalledWith(
        expect.objectContaining({ pack_id: "pack-2" }),
      );
    });

    it("should close dropdown on Escape key", async () => {
      const user = userEvent.setup();
      renderWithProviders(<PackSearchCombobox {...defaultProps} />);

      const input = screen.getByRole("combobox");
      await user.click(input);

      await waitFor(() => {
        expect(screen.getByRole("listbox")).toBeInTheDocument();
      });

      await user.keyboard("{Escape}");

      await waitFor(() => {
        expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
      });
    });

    it("should open dropdown on Arrow Down when closed", async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <PackSearchCombobox {...defaultProps} searchQuery="Me" />,
      );

      const input = screen.getByRole("combobox");
      await user.click(input);

      // Close dropdown
      await user.keyboard("{Escape}");
      await waitFor(() => {
        expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
      });

      // Reopen with Arrow Down
      await user.keyboard("{ArrowDown}");

      await waitFor(() => {
        expect(screen.getByRole("listbox")).toBeInTheDocument();
      });
    });
  });

  // ============================================================================
  // SECTION 6: ACCESSIBILITY (PSC-008)
  // ============================================================================

  describe("Accessibility", () => {
    it("PSC-008: should have proper ARIA attributes", async () => {
      const user = userEvent.setup();
      renderWithProviders(<PackSearchCombobox {...defaultProps} />);

      const input = screen.getByRole("combobox");

      expect(input).toHaveAttribute("aria-expanded", "false");
      expect(input).toHaveAttribute("aria-autocomplete", "list");

      await user.click(input);

      await waitFor(() => {
        expect(input).toHaveAttribute("aria-expanded", "true");
        expect(input).toHaveAttribute("aria-controls", "pack-listbox");
      });
    });

    it("should have proper role attributes on dropdown elements", async () => {
      const user = userEvent.setup();
      renderWithProviders(<PackSearchCombobox {...defaultProps} />);

      const input = screen.getByRole("combobox");
      await user.click(input);

      await waitFor(() => {
        const listbox = screen.getByRole("listbox");
        expect(listbox).toBeInTheDocument();
        expect(listbox).toHaveAttribute("id", "pack-listbox");

        const options = screen.getAllByRole("option");
        expect(options).toHaveLength(2);
        options.forEach((option) => {
          expect(option).toHaveAttribute("aria-selected");
        });
      });
    });
  });

  // ============================================================================
  // SECTION 7: EDGE CASES (PSC-009, PSC-012)
  // ============================================================================

  describe("Edge Cases", () => {
    it("PSC-009: should handle null storeId gracefully", () => {
      renderWithProviders(
        <PackSearchCombobox {...defaultProps} storeId={null} />,
      );

      expect(screen.getByRole("combobox")).toBeInTheDocument();
    });

    it("PSC-012: should close dropdown when clicking outside", async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <div>
          <PackSearchCombobox {...defaultProps} />
          <div data-testid="outside">Outside Element</div>
        </div>,
      );

      const input = screen.getByRole("combobox");
      await user.click(input);

      await waitFor(() => {
        expect(screen.getByRole("listbox")).toBeInTheDocument();
      });

      const outside = screen.getByTestId("outside");
      fireEvent.mouseDown(outside);

      await waitFor(() => {
        expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
      });
    });

    it("should show dropdown testId when testId prop is provided", async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <PackSearchCombobox {...defaultProps} testId="pack-combobox" />,
      );

      const input = screen.getByRole("combobox");
      await user.click(input);

      await waitFor(() => {
        expect(
          screen.getByTestId("pack-combobox-dropdown"),
        ).toBeInTheDocument();
      });
    });
  });

  // ============================================================================
  // SECTION 8: SECURITY (PSC-013, PSC-014)
  // ============================================================================

  describe("Security", () => {
    it("PSC-013: should handle special characters in search safely", async () => {
      const user = userEvent.setup();
      const onSearchQueryChange = vi.fn();
      const xssString = '<script>alert("xss")</script>';

      // Render with the XSS string already in searchQuery (simulates controlled input)
      renderWithProviders(
        <PackSearchCombobox
          {...defaultProps}
          searchQuery={xssString}
          onSearchQueryChange={onSearchQueryChange}
        />,
      );

      const input = screen.getByRole("combobox") as HTMLInputElement;

      // The input should display the special characters safely (not execute them)
      expect(input.value).toBe(xssString);

      // Type an additional character to verify callback works with special chars
      await user.type(input, "x");
      expect(onSearchQueryChange).toHaveBeenCalledWith(xssString + "x");
    });

    it("PSC-014: should safely render pack data with special characters (XSS prevention)", async () => {
      const user = userEvent.setup();
      const xssPack = [
        {
          pack_id: "pack-xss",
          pack_number: "<img src=x onerror=alert(1)>",
          game_id: "game-xss",
          game: { name: "<script>alert('xss')</script>", price: 1.0 },
          serial_start: "001",
          serial_end: "100",
          status: "RECEIVED",
        },
      ];
      setupMocks({ recentPacks: xssPack });

      renderWithProviders(<PackSearchCombobox {...defaultProps} />);

      const input = screen.getByRole("combobox");
      await user.click(input);

      // React auto-escapes - the text should be displayed literally, not executed
      await waitFor(() => {
        // The text is escaped and rendered as text content
        const listbox = screen.getByRole("listbox");
        expect(listbox.textContent).toContain("<script>");
      });
    });
  });

  // ============================================================================
  // SECTION 9: FORWARD REF IMPERATIVE METHODS (PSC-015, PSC-016, PSC-017)
  // ============================================================================

  describe("ForwardRef Imperative Methods", () => {
    it("PSC-015: should expose focus method via ref", async () => {
      const ref = { current: null } as React.RefObject<{
        focus: () => void;
        clear: () => void;
      }>;

      renderWithProviders(<PackSearchCombobox {...defaultProps} ref={ref} />);

      await waitFor(() => {
        expect(ref.current).not.toBeNull();
        expect(typeof ref.current?.focus).toBe("function");
      });
    });

    it("PSC-016: should expose clear method via ref", async () => {
      const ref = { current: null } as React.RefObject<{
        focus: () => void;
        clear: () => void;
      }>;

      renderWithProviders(<PackSearchCombobox {...defaultProps} ref={ref} />);

      await waitFor(() => {
        expect(ref.current).not.toBeNull();
        expect(typeof ref.current?.clear).toBe("function");
      });
    });

    it("PSC-017: should call onSearchQueryChange with empty string when clear() is called", async () => {
      const onSearchQueryChange = vi.fn();
      const onClear = vi.fn();
      const ref = { current: null } as React.RefObject<{
        focus: () => void;
        clear: () => void;
      }>;

      renderWithProviders(
        <PackSearchCombobox
          {...defaultProps}
          searchQuery="Some Search"
          onSearchQueryChange={onSearchQueryChange}
          onClear={onClear}
          ref={ref}
        />,
      );

      await waitFor(() => {
        expect(ref.current).not.toBeNull();
      });

      // Now call clear via ref
      ref.current?.clear();

      // Should call onSearchQueryChange with empty string
      expect(onSearchQueryChange).toHaveBeenCalledWith("");
      // Should also call onClear
      expect(onClear).toHaveBeenCalled();
    });

    it("should maintain ref through re-renders", async () => {
      const ref = { current: null } as React.RefObject<{
        focus: () => void;
        clear: () => void;
      }>;

      const { rerender } = renderWithProviders(
        <PackSearchCombobox {...defaultProps} ref={ref} />,
      );

      await waitFor(() => {
        expect(ref.current).not.toBeNull();
      });

      // Rerender with different props
      rerender(
        <QueryClientProvider
          client={
            new QueryClient({
              defaultOptions: { queries: { retry: false } },
            })
          }
        >
          <PackSearchCombobox
            {...defaultProps}
            label="Updated Label"
            ref={ref}
          />
        </QueryClientProvider>,
      );

      await waitFor(() => {
        // Ref should still be valid
        expect(ref.current).not.toBeNull();
        expect(typeof ref.current?.focus).toBe("function");
        expect(typeof ref.current?.clear).toBe("function");
      });
    });
  });
});
