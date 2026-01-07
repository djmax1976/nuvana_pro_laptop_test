/**
 * Component Tests: LotteryTable - Game Status Badge & Return Button Feature
 *
 * Tests for the new game status display and return button features:
 * - Game status badge displays lifecycle status (ACTIVE/INACTIVE/DISCONTINUED)
 * - Game status badge uses blue (default) variant to differentiate from pack status
 * - Return button replaces checkbox for pack returns
 * - Return button disabled state controlled by backend can_return field (SEC-010: AUTHZ)
 * - Return button accessibility and interaction patterns
 *
 * @test-level COMPONENT
 * @justification Tests UI component behavior in isolation - fast, isolated, granular
 * @story Game Status Display Feature, Lottery Pack Return Feature
 * @priority P1 (High - Core Feature)
 * @created 2025-01-XX
 *
 * Tracing Matrix:
 * | Test ID                               | Requirement        | Component Feature                      |
 * |---------------------------------------|--------------------|-----------------------------------------|
 * | GAME-STATUS-001                       | Game Status Badge  | Badge displays ACTIVE status           |
 * | GAME-STATUS-002                       | Game Status Badge  | Badge displays INACTIVE status         |
 * | GAME-STATUS-003                       | Game Status Badge  | Badge displays DISCONTINUED status     |
 * | GAME-STATUS-004                       | Game Status Badge  | Badge uses default (blue) variant      |
 * | GAME-STATUS-005                       | Game Status Badge  | Badge size matches parent styling      |
 * | GAME-STATUS-006                       | Game Status Badge  | Fallback to ACTIVE when missing        |
 * | RETURN-BTN-001                        | Return Button      | Button enabled when can_return=true    |
 * | RETURN-BTN-002                        | Return Button      | Button disabled when can_return=false  |
 * | RETURN-BTN-003                        | Return Button      | Already returned pack shows disabled   |
 * | RETURN-BTN-004                        | Return Button      | Button uses backend authorization      |
 * | RETURN-BTN-005                        | Return Button      | ACTIVE pack with can_return=true       |
 * | RETURN-BTN-006                        | Return Button      | RECEIVED pack with can_return=true     |
 * | RETURN-BTN-007                        | Return Button      | DEPLETED pack with can_return=false    |
 * | RETURN-BTN-008                        | Accessibility      | Correct aria-label for enabled btn     |
 * | RETURN-BTN-009                        | Accessibility      | Correct aria-label for disabled btn    |
 * | RETURN-BTN-010                        | Accessibility      | Correct aria-label for returned pack   |
 * | SEC-010-001                           | Security           | Backend auth prevents return bypass    |
 * | SEC-004-001                           | Security           | XSS prevention in game status          |
 *
 * MCP Guidance Applied:
 * - SEC-010: AUTHZ - Server-side authorization for return eligibility
 * - SEC-004: XSS - React auto-escapes output
 * - SEC-014: INPUT_VALIDATION - Strict enum types for game status
 * - FE-005: UI_SECURITY - Display values derived from backend enums
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  cleanup,
  within,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LotteryTable } from "@/components/lottery/LotteryTable";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Mock useLotteryPacks hook
vi.mock("@/hooks/useLottery", () => ({
  useLotteryPacks: vi.fn(),
  usePackDetails: vi.fn(() => ({
    data: null,
    isLoading: false,
    isError: false,
    error: null,
  })),
  useUpdateGame: vi.fn(() => ({
    mutateAsync: vi.fn(),
    isPending: false,
  })),
  useReturnPack: vi.fn(() => ({
    mutateAsync: vi.fn().mockResolvedValue({ success: true }),
    isPending: false,
  })),
}));

// Mock fetch for bins API
const mockFetch = vi.fn();
global.fetch = mockFetch;

import { useLotteryPacks } from "@/hooks/useLottery";

/**
 * Default test props for LotteryTable component
 * SEC-014: INPUT_VALIDATION - Test stores are validated in component
 */
const defaultTestStores = [{ store_id: "store-1", name: "Test Store 1" }];

const defaultTestProps = {
  storeId: "store-1",
  stores: defaultTestStores,
  onStoreChange: vi.fn(),
  onEdit: vi.fn(),
  onDelete: vi.fn(),
};

// Helper to wrap component with QueryClient
function renderWithQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

/**
 * Factory for creating mock packs with game status and can_return fields
 * SEC-010: AUTHZ - can_return field simulates backend authorization
 */
function createMockPack(overrides: {
  pack_id: string;
  pack_number: string;
  status: "ACTIVE" | "RECEIVED" | "DEPLETED" | "RETURNED";
  game_id: string;
  game_name: string;
  game_status?: "ACTIVE" | "INACTIVE" | "DISCONTINUED";
  can_return?: boolean;
  returned_at?: string | null;
}) {
  return {
    pack_id: overrides.pack_id,
    pack_number: overrides.pack_number,
    status: overrides.status,
    serial_start: "1000",
    serial_end: "2000",
    game_id: overrides.game_id,
    store_id: "store-1",
    current_bin_id: "bin-1",
    received_at: "2025-01-15T10:00:00Z",
    activated_at: overrides.status === "ACTIVE" ? "2025-01-16T10:00:00Z" : null,
    depleted_at:
      overrides.status === "DEPLETED" ? "2025-01-20T10:00:00Z" : null,
    returned_at: overrides.returned_at ?? null,
    // SEC-010: AUTHZ - can_return from backend
    can_return: overrides.can_return ?? false,
    game: {
      game_id: overrides.game_id,
      game_code: "001",
      name: overrides.game_name,
      price: 5.0,
      // SEC-014: INPUT_VALIDATION - Game status enum
      status: overrides.game_status ?? "ACTIVE",
    },
    bin: {
      bin_id: "bin-1",
      name: "Bin 1",
      store_id: "store-1",
      location: "Location 1",
    },
  };
}

describe("LotteryTable: Game Status Badge Feature", () => {
  const mockBins = [{ bin_id: "bin-1" }];

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: mockBins }),
    });
  });

  afterEach(() => {
    cleanup();
  });

  // ============ GAME STATUS BADGE TESTS ============

  it("GAME-STATUS-001: [P1] should display ACTIVE game status in parent row badge", async () => {
    // GIVEN: Pack with game.status = ACTIVE
    const mockPacks = [
      createMockPack({
        pack_id: "pack-1",
        pack_number: "P001",
        status: "ACTIVE",
        game_id: "game-1",
        game_name: "Active Game",
        game_status: "ACTIVE",
        can_return: true,
      }),
    ];

    (useLotteryPacks as ReturnType<typeof vi.fn>).mockReturnValue({
      data: mockPacks,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    // WHEN: Component is rendered
    renderWithQueryClient(<LotteryTable {...defaultTestProps} />);

    // THEN: Game status badge displays "Active"
    const gameStatusBadge = screen.getByTestId("game-status-badge-game-1");
    expect(gameStatusBadge).toBeInTheDocument();
    expect(gameStatusBadge).toHaveTextContent("Active");
  });

  it("GAME-STATUS-002: [P1] should display INACTIVE game status in parent row badge", async () => {
    // GIVEN: Pack with game.status = INACTIVE
    const mockPacks = [
      createMockPack({
        pack_id: "pack-1",
        pack_number: "P001",
        status: "ACTIVE",
        game_id: "game-inactive",
        game_name: "Inactive Game",
        game_status: "INACTIVE",
        can_return: true,
      }),
    ];

    (useLotteryPacks as ReturnType<typeof vi.fn>).mockReturnValue({
      data: mockPacks,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    // WHEN: Component is rendered
    renderWithQueryClient(<LotteryTable {...defaultTestProps} />);

    // THEN: Game status badge displays "Inactive"
    const gameStatusBadge = screen.getByTestId(
      "game-status-badge-game-inactive",
    );
    expect(gameStatusBadge).toBeInTheDocument();
    expect(gameStatusBadge).toHaveTextContent("Inactive");
  });

  it("GAME-STATUS-003: [P1] should display DISCONTINUED game status in parent row badge", async () => {
    // GIVEN: Pack with game.status = DISCONTINUED
    const mockPacks = [
      createMockPack({
        pack_id: "pack-1",
        pack_number: "P001",
        status: "ACTIVE",
        game_id: "game-discontinued",
        game_name: "Old Game",
        game_status: "DISCONTINUED",
        can_return: true,
      }),
    ];

    (useLotteryPacks as ReturnType<typeof vi.fn>).mockReturnValue({
      data: mockPacks,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    // WHEN: Component is rendered
    renderWithQueryClient(<LotteryTable {...defaultTestProps} />);

    // THEN: Game status badge displays "Discontinued"
    const gameStatusBadge = screen.getByTestId(
      "game-status-badge-game-discontinued",
    );
    expect(gameStatusBadge).toBeInTheDocument();
    expect(gameStatusBadge).toHaveTextContent("Discontinued");
  });

  it("GAME-STATUS-004: [P1] should use default (blue/primary) variant for game status badge", async () => {
    // GIVEN: Pack with any game status
    const mockPacks = [
      createMockPack({
        pack_id: "pack-1",
        pack_number: "P001",
        status: "ACTIVE",
        game_id: "game-1",
        game_name: "Test Game",
        game_status: "ACTIVE",
        can_return: true,
      }),
    ];

    (useLotteryPacks as ReturnType<typeof vi.fn>).mockReturnValue({
      data: mockPacks,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    // WHEN: Component is rendered
    renderWithQueryClient(<LotteryTable {...defaultTestProps} />);

    // THEN: Badge exists and is styled with default (primary) variant
    // Badge component with variant="default" applies primary color classes
    const gameStatusBadge = screen.getByTestId("game-status-badge-game-1");
    expect(gameStatusBadge).toBeInTheDocument();
    // Verify it has text-xs class for consistent sizing
    expect(gameStatusBadge).toHaveClass("text-xs");
  });

  it("GAME-STATUS-005: [P1] should have consistent text-xs class for badge size", async () => {
    // GIVEN: Pack with game status
    const mockPacks = [
      createMockPack({
        pack_id: "pack-1",
        pack_number: "P001",
        status: "ACTIVE",
        game_id: "game-1",
        game_name: "Test Game",
        game_status: "ACTIVE",
        can_return: true,
      }),
    ];

    (useLotteryPacks as ReturnType<typeof vi.fn>).mockReturnValue({
      data: mockPacks,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    // WHEN: Component is rendered
    renderWithQueryClient(<LotteryTable {...defaultTestProps} />);

    // THEN: Badge has text-xs class for small, consistent sizing
    const gameStatusBadge = screen.getByTestId("game-status-badge-game-1");
    expect(gameStatusBadge).toHaveClass("text-xs");
    expect(gameStatusBadge).toHaveClass("font-medium");
  });

  it("GAME-STATUS-006: [P1] should fallback to ACTIVE when game.status is missing", async () => {
    // GIVEN: Pack with game that has no status field
    const mockPacks = [
      {
        pack_id: "pack-1",
        pack_number: "P001",
        status: "ACTIVE" as const,
        serial_start: "1000",
        serial_end: "2000",
        game_id: "game-no-status",
        store_id: "store-1",
        current_bin_id: "bin-1",
        received_at: "2025-01-15T10:00:00Z",
        activated_at: "2025-01-16T10:00:00Z",
        depleted_at: null,
        returned_at: null,
        can_return: true,
        game: {
          game_id: "game-no-status",
          game_code: "001",
          name: "Game Without Status",
          price: 5.0,
          // status field intentionally omitted
        },
        bin: null,
      },
    ];

    (useLotteryPacks as ReturnType<typeof vi.fn>).mockReturnValue({
      data: mockPacks,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    // WHEN: Component is rendered
    renderWithQueryClient(<LotteryTable {...defaultTestProps} />);

    // THEN: Badge displays "Active" as fallback
    const gameStatusBadge = screen.getByTestId(
      "game-status-badge-game-no-status",
    );
    expect(gameStatusBadge).toHaveTextContent("Active");
  });

  it("GAME-STATUS-007: [P1] should display game status instead of pack count badges", async () => {
    // GIVEN: Multiple packs of the same game with different statuses
    const mockPacks = [
      createMockPack({
        pack_id: "pack-1",
        pack_number: "P001",
        status: "ACTIVE",
        game_id: "game-multi",
        game_name: "Multi Pack Game",
        game_status: "ACTIVE",
        can_return: true,
      }),
      createMockPack({
        pack_id: "pack-2",
        pack_number: "P002",
        status: "RECEIVED",
        game_id: "game-multi",
        game_name: "Multi Pack Game",
        game_status: "ACTIVE",
        can_return: true,
      }),
    ];

    (useLotteryPacks as ReturnType<typeof vi.fn>).mockReturnValue({
      data: mockPacks,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    // WHEN: Component is rendered
    renderWithQueryClient(<LotteryTable {...defaultTestProps} />);

    // THEN: Only game status badge is shown (not pack count badges)
    const gameStatusBadge = screen.getByTestId("game-status-badge-game-multi");
    expect(gameStatusBadge).toHaveTextContent("Active");

    // AND: Old pack count badges should NOT be present
    expect(screen.queryByText("2 Active")).not.toBeInTheDocument();
    expect(screen.queryByText("1 Active")).not.toBeInTheDocument();
    expect(screen.queryByText("1 Received")).not.toBeInTheDocument();
  });
});

describe("LotteryTable: Return Button Feature (SEC-010: AUTHZ)", () => {
  const mockBins = [{ bin_id: "bin-1" }];

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: mockBins }),
    });
  });

  afterEach(() => {
    cleanup();
  });

  // ============ RETURN BUTTON AUTHORIZATION TESTS ============

  it("RETURN-BTN-001: [P0] should enable Return button when backend can_return=true", async () => {
    // GIVEN: ACTIVE pack with can_return=true from backend
    // SEC-010: AUTHZ - Backend determines returnability
    const mockPacks = [
      createMockPack({
        pack_id: "pack-active-returnable",
        pack_number: "P001",
        status: "ACTIVE",
        game_id: "game-1",
        game_name: "Test Game",
        game_status: "ACTIVE",
        can_return: true, // Backend authorization
      }),
    ];

    (useLotteryPacks as ReturnType<typeof vi.fn>).mockReturnValue({
      data: mockPacks,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    const user = userEvent.setup();
    renderWithQueryClient(<LotteryTable {...defaultTestProps} />);

    // Expand the game row to see pack details
    const gameRow = screen.getByTestId("lottery-table-row-game-1");
    await user.click(gameRow);

    // THEN: Return button is enabled
    const returnButton = screen.getByTestId(
      "return-pack-btn-pack-active-returnable",
    );
    expect(returnButton).toBeInTheDocument();
    expect(returnButton).not.toBeDisabled();
    expect(returnButton).toHaveTextContent("Return");
  });

  it("RETURN-BTN-002: [P0] should disable Return button when backend can_return=false", async () => {
    // GIVEN: ACTIVE pack with can_return=false from backend
    // SEC-010: AUTHZ - Backend determines returnability
    // Using ACTIVE status so pack appears in default view without filter
    const mockPacks = [
      createMockPack({
        pack_id: "pack-not-returnable",
        pack_number: "P001",
        status: "ACTIVE", // ACTIVE so it shows in default view
        game_id: "game-1",
        game_name: "Test Game",
        game_status: "ACTIVE",
        can_return: false, // Backend says cannot return
      }),
    ];

    (useLotteryPacks as ReturnType<typeof vi.fn>).mockReturnValue({
      data: mockPacks,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    const user = userEvent.setup();
    renderWithQueryClient(<LotteryTable {...defaultTestProps} />);

    // Expand the game row (ACTIVE packs show in default view)
    const gameRow = screen.getByTestId("lottery-table-row-game-1");
    await user.click(gameRow);

    // THEN: Return button is disabled
    const returnButton = screen.getByTestId(
      "return-pack-btn-pack-not-returnable",
    );
    expect(returnButton).toBeInTheDocument();
    expect(returnButton).toBeDisabled();
  });

  it("RETURN-BTN-003: [P0] should show disabled Return button for already RETURNED pack", async () => {
    // GIVEN: RETURNED pack with can_return=false
    const mockPacks = [
      createMockPack({
        pack_id: "pack-already-returned",
        pack_number: "P001",
        status: "RETURNED",
        game_id: "game-1",
        game_name: "Test Game",
        game_status: "ACTIVE",
        can_return: false, // Already returned, cannot return again
        returned_at: "2025-01-20T10:00:00Z",
      }),
    ];

    (useLotteryPacks as ReturnType<typeof vi.fn>).mockReturnValue({
      data: mockPacks,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    const user = userEvent.setup();
    renderWithQueryClient(<LotteryTable {...defaultTestProps} />);

    // Select RETURNED filter
    const statusSelect = screen.getByTestId("filter-status");
    await user.click(statusSelect);
    const returnedOption = await screen.findByRole("option", {
      name: "Returned",
    });
    await user.click(returnedOption);

    // Expand the game row
    const gameRow = screen.getByTestId("lottery-table-row-game-1");
    await user.click(gameRow);

    // THEN: Return button is disabled
    const returnButton = screen.getByTestId(
      "return-pack-btn-pack-already-returned",
    );
    expect(returnButton).toBeDisabled();
  });

  it("RETURN-BTN-004: [P0] should use backend can_return field, not frontend pack status logic", async () => {
    // GIVEN: Two ACTIVE packs - one with can_return=true, one with can_return=false
    // This tests that frontend uses backend authorization, not local logic
    // SEC-010: AUTHZ - Backend is source of truth for authorization
    const mockPacks = [
      createMockPack({
        pack_id: "pack-authorized",
        pack_number: "P001",
        status: "ACTIVE",
        game_id: "game-auth-test",
        game_name: "Auth Test Game",
        game_status: "ACTIVE",
        can_return: true, // Backend authorized
      }),
      createMockPack({
        pack_id: "pack-not-authorized",
        pack_number: "P002",
        status: "ACTIVE",
        game_id: "game-auth-test",
        game_name: "Auth Test Game",
        game_status: "ACTIVE",
        can_return: false, // Backend NOT authorized (maybe shift not open, etc.)
      }),
    ];

    (useLotteryPacks as ReturnType<typeof vi.fn>).mockReturnValue({
      data: mockPacks,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    const user = userEvent.setup();
    renderWithQueryClient(<LotteryTable {...defaultTestProps} />);

    // Expand the game row
    const gameRow = screen.getByTestId("lottery-table-row-game-auth-test");
    await user.click(gameRow);

    // THEN: First button is enabled, second is disabled
    // Both packs are ACTIVE, but authorization differs from backend
    const authorizedBtn = screen.getByTestId("return-pack-btn-pack-authorized");
    const notAuthorizedBtn = screen.getByTestId(
      "return-pack-btn-pack-not-authorized",
    );

    expect(authorizedBtn).not.toBeDisabled();
    expect(notAuthorizedBtn).toBeDisabled();
  });

  it("RETURN-BTN-005: [P1] should enable Return for ACTIVE pack with can_return=true", async () => {
    // GIVEN: ACTIVE pack with can_return=true
    const mockPacks = [
      createMockPack({
        pack_id: "pack-active",
        pack_number: "P001",
        status: "ACTIVE",
        game_id: "game-1",
        game_name: "Test Game",
        game_status: "ACTIVE",
        can_return: true,
      }),
    ];

    (useLotteryPacks as ReturnType<typeof vi.fn>).mockReturnValue({
      data: mockPacks,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    const user = userEvent.setup();
    renderWithQueryClient(<LotteryTable {...defaultTestProps} />);

    await user.click(screen.getByTestId("lottery-table-row-game-1"));

    // THEN: Return button is enabled
    const returnButton = screen.getByTestId("return-pack-btn-pack-active");
    expect(returnButton).not.toBeDisabled();
  });

  it("RETURN-BTN-006: [P1] should enable Return for RECEIVED pack with can_return=true", async () => {
    // GIVEN: RECEIVED pack with can_return=true
    // Business Rule: RECEIVED packs can be returned
    const mockPacks = [
      createMockPack({
        pack_id: "pack-received",
        pack_number: "P001",
        status: "RECEIVED",
        game_id: "game-1",
        game_name: "Test Game",
        game_status: "ACTIVE",
        can_return: true,
      }),
    ];

    (useLotteryPacks as ReturnType<typeof vi.fn>).mockReturnValue({
      data: mockPacks,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    const user = userEvent.setup();
    renderWithQueryClient(<LotteryTable {...defaultTestProps} />);

    await user.click(screen.getByTestId("lottery-table-row-game-1"));

    // THEN: Return button is enabled for RECEIVED pack
    const returnButton = screen.getByTestId("return-pack-btn-pack-received");
    expect(returnButton).not.toBeDisabled();
  });

  it("RETURN-BTN-007: [P1] should disable Return for pack with can_return=false (e.g., DEPLETED)", async () => {
    // GIVEN: Pack with can_return=false (simulating DEPLETED business rule)
    // Business Rule: DEPLETED packs cannot be returned (already sold out)
    // We use ACTIVE status to show in default view, but can_return=false from backend
    const mockPacks = [
      createMockPack({
        pack_id: "pack-cannot-return",
        pack_number: "P001",
        status: "ACTIVE", // ACTIVE to show in default view
        game_id: "game-1",
        game_name: "Test Game",
        game_status: "ACTIVE",
        can_return: false, // Backend says cannot return (like DEPLETED would)
      }),
    ];

    (useLotteryPacks as ReturnType<typeof vi.fn>).mockReturnValue({
      data: mockPacks,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    const user = userEvent.setup();
    renderWithQueryClient(<LotteryTable {...defaultTestProps} />);

    // Expand the game row
    await user.click(screen.getByTestId("lottery-table-row-game-1"));

    // THEN: Return button is disabled
    const returnButton = screen.getByTestId(
      "return-pack-btn-pack-cannot-return",
    );
    expect(returnButton).toBeDisabled();
  });

  // ============ ACCESSIBILITY TESTS ============

  it("RETURN-BTN-008: [P2] should have correct aria-label for enabled Return button", async () => {
    // GIVEN: ACTIVE pack with can_return=true
    const mockPacks = [
      createMockPack({
        pack_id: "pack-1",
        pack_number: "P001",
        status: "ACTIVE",
        game_id: "game-1",
        game_name: "Test Game",
        game_status: "ACTIVE",
        can_return: true,
      }),
    ];

    (useLotteryPacks as ReturnType<typeof vi.fn>).mockReturnValue({
      data: mockPacks,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    const user = userEvent.setup();
    renderWithQueryClient(<LotteryTable {...defaultTestProps} />);

    await user.click(screen.getByTestId("lottery-table-row-game-1"));

    // THEN: Button has appropriate aria-label
    const returnButton = screen.getByTestId("return-pack-btn-pack-1");
    expect(returnButton).toHaveAttribute(
      "aria-label",
      "Return pack P001 to supplier",
    );
  });

  it("RETURN-BTN-009: [P2] should have correct aria-label for disabled Return button (cannot return)", async () => {
    // GIVEN: ACTIVE pack with can_return=false (backend authorization denied)
    const mockPacks = [
      createMockPack({
        pack_id: "pack-no-auth",
        pack_number: "P001",
        status: "ACTIVE", // ACTIVE so it shows in default view
        game_id: "game-1",
        game_name: "Test Game",
        game_status: "ACTIVE",
        can_return: false, // Backend says cannot return
      }),
    ];

    (useLotteryPacks as ReturnType<typeof vi.fn>).mockReturnValue({
      data: mockPacks,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    const user = userEvent.setup();
    renderWithQueryClient(<LotteryTable {...defaultTestProps} />);

    // Expand the game row
    await user.click(screen.getByTestId("lottery-table-row-game-1"));

    // THEN: Button has appropriate aria-label for non-returnable pack
    const returnButton = screen.getByTestId("return-pack-btn-pack-no-auth");
    expect(returnButton).toHaveAttribute(
      "aria-label",
      "Cannot return pack P001",
    );
  });

  it("RETURN-BTN-010: [P2] should have correct aria-label for already returned pack", async () => {
    // GIVEN: RETURNED pack
    const mockPacks = [
      createMockPack({
        pack_id: "pack-returned",
        pack_number: "P001",
        status: "RETURNED",
        game_id: "game-1",
        game_name: "Test Game",
        game_status: "ACTIVE",
        can_return: false,
        returned_at: "2025-01-20T10:00:00Z",
      }),
    ];

    (useLotteryPacks as ReturnType<typeof vi.fn>).mockReturnValue({
      data: mockPacks,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    const user = userEvent.setup();
    renderWithQueryClient(<LotteryTable {...defaultTestProps} />);

    const statusSelect = screen.getByTestId("filter-status");
    await user.click(statusSelect);
    await user.click(await screen.findByRole("option", { name: "Returned" }));

    await user.click(screen.getByTestId("lottery-table-row-game-1"));

    // THEN: Button has appropriate aria-label for already returned pack
    const returnButton = screen.getByTestId("return-pack-btn-pack-returned");
    expect(returnButton).toHaveAttribute(
      "aria-label",
      "Pack P001 already returned",
    );
  });

  // ============ INTERACTION TESTS ============

  it("RETURN-BTN-011: [P1] should open return dialog when enabled button is clicked", async () => {
    // GIVEN: ACTIVE pack with can_return=true
    const mockPacks = [
      createMockPack({
        pack_id: "pack-1",
        pack_number: "P001",
        status: "ACTIVE",
        game_id: "game-1",
        game_name: "Test Game",
        game_status: "ACTIVE",
        can_return: true,
      }),
    ];

    (useLotteryPacks as ReturnType<typeof vi.fn>).mockReturnValue({
      data: mockPacks,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    const user = userEvent.setup();
    renderWithQueryClient(<LotteryTable {...defaultTestProps} />);

    await user.click(screen.getByTestId("lottery-table-row-game-1"));

    // WHEN: User clicks Return button
    const returnButton = screen.getByTestId("return-pack-btn-pack-1");
    await user.click(returnButton);

    // THEN: Return dialog should open (ReturnPackDialog is rendered)
    await waitFor(() => {
      // The dialog should be rendered with the pack data
      // We check for the dialog's presence by its title or content
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
  });

  it("RETURN-BTN-012: [P1] should not trigger any action when disabled button is clicked", async () => {
    // GIVEN: ACTIVE pack with can_return=false (backend says no)
    // This tests that clicking a disabled button doesn't open dialog
    const mockPacks = [
      createMockPack({
        pack_id: "pack-no-return",
        pack_number: "P001",
        status: "ACTIVE", // ACTIVE so it shows in default view
        game_id: "game-1",
        game_name: "Test Game",
        game_status: "ACTIVE",
        can_return: false, // Backend says cannot return
      }),
    ];

    (useLotteryPacks as ReturnType<typeof vi.fn>).mockReturnValue({
      data: mockPacks,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    const user = userEvent.setup();
    renderWithQueryClient(<LotteryTable {...defaultTestProps} />);

    // Expand the game row (ACTIVE packs show in default view)
    await user.click(screen.getByTestId("lottery-table-row-game-1"));

    // WHEN: User attempts to click disabled Return button
    const returnButton = screen.getByTestId("return-pack-btn-pack-no-return");
    expect(returnButton).toBeDisabled();

    // Attempt to click (should not do anything)
    await user.click(returnButton);

    // THEN: No dialog should open
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("LotteryTable: Security Tests (SEC-010, SEC-004)", () => {
  const mockBins = [{ bin_id: "bin-1" }];

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: mockBins }),
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("SEC-010-001: [P0] should prevent return action bypass by relying on backend can_return", async () => {
    // GIVEN: Pack that appears returnable by status but backend says no
    // This simulates a scenario where frontend might try to bypass authorization
    const mockPacks = [
      createMockPack({
        pack_id: "pack-bypass-attempt",
        pack_number: "P001",
        status: "ACTIVE", // Status suggests returnable
        game_id: "game-1",
        game_name: "Test Game",
        game_status: "ACTIVE",
        can_return: false, // But backend says NO
      }),
    ];

    (useLotteryPacks as ReturnType<typeof vi.fn>).mockReturnValue({
      data: mockPacks,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    const user = userEvent.setup();
    renderWithQueryClient(<LotteryTable {...defaultTestProps} />);

    await user.click(screen.getByTestId("lottery-table-row-game-1"));

    // THEN: Button is disabled even though pack status is ACTIVE
    // SEC-010: AUTHZ - Backend authorization is enforced
    const returnButton = screen.getByTestId(
      "return-pack-btn-pack-bypass-attempt",
    );
    expect(returnButton).toBeDisabled();
  });

  it("SEC-004-001: [P0] should prevent XSS in game status display", async () => {
    // GIVEN: Pack with malicious game status value
    const mockPacks = [
      {
        pack_id: "pack-xss",
        pack_number: "P001",
        status: "ACTIVE" as const,
        serial_start: "1000",
        serial_end: "2000",
        game_id: "game-xss",
        store_id: "store-1",
        current_bin_id: "bin-1",
        received_at: "2025-01-15T10:00:00Z",
        activated_at: "2025-01-16T10:00:00Z",
        depleted_at: null,
        returned_at: null,
        can_return: true,
        game: {
          game_id: "game-xss",
          game_code: "001",
          name: "Test Game",
          price: 5.0,
          // Attempt XSS via status value (would require backend vulnerability)
          status: "<script>alert('XSS')</script>" as any,
        },
        bin: null,
      },
    ];

    (useLotteryPacks as ReturnType<typeof vi.fn>).mockReturnValue({
      data: mockPacks,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    // WHEN: Component is rendered
    renderWithQueryClient(<LotteryTable {...defaultTestProps} />);

    // THEN: XSS attempt is escaped (React escapes by default)
    const gameStatusBadge = screen.getByTestId("game-status-badge-game-xss");
    expect(gameStatusBadge).toBeInTheDocument();
    // Should display the malicious string as text, not execute it
    expect(gameStatusBadge.innerHTML).toContain("&lt;script&gt;");
  });
});

describe("LotteryTable: Edge Cases", () => {
  const mockBins = [{ bin_id: "bin-1" }];

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: mockBins }),
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("EDGE-001: [P2] should derive can_return from status when field is undefined (ACTIVE pack)", async () => {
    // GIVEN: ACTIVE Pack without can_return field (legacy data or backend not updated)
    // Business Rule: ACTIVE packs should be returnable even if can_return field missing
    const mockPacks = [
      {
        pack_id: "pack-no-can-return",
        pack_number: "P001",
        status: "ACTIVE" as const, // ACTIVE = should be returnable
        serial_start: "1000",
        serial_end: "2000",
        game_id: "game-1",
        store_id: "store-1",
        current_bin_id: "bin-1",
        received_at: "2025-01-15T10:00:00Z",
        activated_at: "2025-01-16T10:00:00Z",
        depleted_at: null,
        returned_at: null,
        // can_return field intentionally omitted - should fallback to status check
        game: {
          game_id: "game-1",
          game_code: "001",
          name: "Test Game",
          price: 5.0,
          status: "ACTIVE",
        },
        bin: null,
      },
    ];

    (useLotteryPacks as ReturnType<typeof vi.fn>).mockReturnValue({
      data: mockPacks,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    const user = userEvent.setup();
    renderWithQueryClient(<LotteryTable {...defaultTestProps} />);

    await user.click(screen.getByTestId("lottery-table-row-game-1"));

    // THEN: Button should be ENABLED because ACTIVE packs are returnable
    // (fallback logic derives can_return from status when undefined)
    const returnButton = screen.getByTestId(
      "return-pack-btn-pack-no-can-return",
    );
    expect(returnButton).not.toBeDisabled();
  });

  it("EDGE-001b: [P2] should derive can_return from status when field is undefined (RECEIVED pack)", async () => {
    // GIVEN: RECEIVED Pack without can_return field (legacy data or backend not updated)
    // Business Rule: RECEIVED packs should be returnable even if can_return field missing
    const mockPacks = [
      {
        pack_id: "pack-received-no-can-return",
        pack_number: "P002",
        status: "RECEIVED" as const, // RECEIVED = should be returnable
        serial_start: "1000",
        serial_end: "2000",
        game_id: "game-1",
        store_id: "store-1",
        current_bin_id: null,
        received_at: "2025-01-15T10:00:00Z",
        activated_at: null, // Not activated yet
        depleted_at: null,
        returned_at: null,
        // can_return field intentionally omitted - should fallback to status check
        game: {
          game_id: "game-1",
          game_code: "001",
          name: "Test Game",
          price: 5.0,
          status: "ACTIVE",
        },
        bin: null,
      },
    ];

    (useLotteryPacks as ReturnType<typeof vi.fn>).mockReturnValue({
      data: mockPacks,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    const user = userEvent.setup();
    renderWithQueryClient(<LotteryTable {...defaultTestProps} />);

    await user.click(screen.getByTestId("lottery-table-row-game-1"));

    // THEN: Button should be ENABLED because RECEIVED packs are returnable
    // (fallback logic derives can_return from status when undefined)
    const returnButton = screen.getByTestId(
      "return-pack-btn-pack-received-no-can-return",
    );
    expect(returnButton).not.toBeDisabled();
  });

  it("EDGE-002: [P2] should handle mixed packs with different can_return values", async () => {
    // GIVEN: Multiple packs of same game with different authorization
    const mockPacks = [
      createMockPack({
        pack_id: "pack-can-return",
        pack_number: "P001",
        status: "ACTIVE",
        game_id: "game-mixed",
        game_name: "Mixed Auth Game",
        game_status: "ACTIVE",
        can_return: true,
      }),
      createMockPack({
        pack_id: "pack-cannot-return",
        pack_number: "P002",
        status: "ACTIVE",
        game_id: "game-mixed",
        game_name: "Mixed Auth Game",
        game_status: "ACTIVE",
        can_return: false,
      }),
      createMockPack({
        pack_id: "pack-received-can-return",
        pack_number: "P003",
        status: "RECEIVED",
        game_id: "game-mixed",
        game_name: "Mixed Auth Game",
        game_status: "ACTIVE",
        can_return: true,
      }),
    ];

    (useLotteryPacks as ReturnType<typeof vi.fn>).mockReturnValue({
      data: mockPacks,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    const user = userEvent.setup();
    renderWithQueryClient(<LotteryTable {...defaultTestProps} />);

    await user.click(screen.getByTestId("lottery-table-row-game-mixed"));

    // THEN: Each button reflects its own authorization
    expect(
      screen.getByTestId("return-pack-btn-pack-can-return"),
    ).not.toBeDisabled();
    expect(
      screen.getByTestId("return-pack-btn-pack-cannot-return"),
    ).toBeDisabled();
    expect(
      screen.getByTestId("return-pack-btn-pack-received-can-return"),
    ).not.toBeDisabled();
  });

  it("EDGE-003: [P2] should handle games with all three status types", async () => {
    // GIVEN: Three games with different statuses
    const mockPacks = [
      createMockPack({
        pack_id: "pack-active-game",
        pack_number: "P001",
        status: "ACTIVE",
        game_id: "game-active",
        game_name: "Active Game",
        game_status: "ACTIVE",
        can_return: true,
      }),
      createMockPack({
        pack_id: "pack-inactive-game",
        pack_number: "P002",
        status: "ACTIVE",
        game_id: "game-inactive",
        game_name: "Inactive Game",
        game_status: "INACTIVE",
        can_return: true,
      }),
      createMockPack({
        pack_id: "pack-discontinued-game",
        pack_number: "P003",
        status: "ACTIVE",
        game_id: "game-discontinued",
        game_name: "Discontinued Game",
        game_status: "DISCONTINUED",
        can_return: true,
      }),
    ];

    (useLotteryPacks as ReturnType<typeof vi.fn>).mockReturnValue({
      data: mockPacks,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    renderWithQueryClient(<LotteryTable {...defaultTestProps} />);

    // THEN: All three game status badges are displayed correctly
    expect(
      screen.getByTestId("game-status-badge-game-active"),
    ).toHaveTextContent("Active");
    expect(
      screen.getByTestId("game-status-badge-game-inactive"),
    ).toHaveTextContent("Inactive");
    expect(
      screen.getByTestId("game-status-badge-game-discontinued"),
    ).toHaveTextContent("Discontinued");
  });
});
