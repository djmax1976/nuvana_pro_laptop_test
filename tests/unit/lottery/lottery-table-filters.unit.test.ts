/**
 * Unit Tests: LotteryTable Filter Logic
 *
 * Tests the pure filter logic used in LotteryTable component:
 * - Status filter (All, Received, Active, Sold/Depleted)
 * - Date range filter
 * - Game name/code filter
 * - Game grouping and sorting
 *
 * These are pure function tests at the base of the testing pyramid,
 * testing business logic without DOM rendering.
 *
 * @test-level UNIT
 * @justification Pure logic tests - fastest, most isolated, highest coverage
 * @story 6-10-1 - Client Dashboard Lottery Page
 * @priority P1 (High - Business Logic)
 *
 * Tracing Matrix:
 * | Test ID                    | Requirement      | Logic Feature                  |
 * |----------------------------|------------------|--------------------------------|
 * | UNIT-FILTER-001            | Status Filter    | Filter by ACTIVE status        |
 * | UNIT-FILTER-002            | Status Filter    | Filter by RECEIVED status      |
 * | UNIT-FILTER-003            | Status Filter    | Filter by SOLD/DEPLETED        |
 * | UNIT-FILTER-004            | Status Filter    | All status (default view)      |
 * | UNIT-DATE-001              | Date Filter      | Filter by date range           |
 * | UNIT-DATE-002              | Date Filter      | Date from only                 |
 * | UNIT-DATE-003              | Date Filter      | Date to only                   |
 * | UNIT-GROUP-001             | Grouping         | Group packs by game            |
 * | UNIT-GROUP-002             | Grouping         | Sort games alphabetically      |
 * | UNIT-SEARCH-001            | Search           | Search by game name            |
 * | UNIT-SEARCH-002            | Search           | Search by game code            |
 */

import { describe, it, expect } from "vitest";

// Type definitions matching LotteryTable component
interface LotteryPack {
  pack_id: string;
  pack_number: string;
  status: "RECEIVED" | "ACTIVE" | "DEPLETED" | "RETURNED";
  received_at: string | null;
  activated_at: string | null;
  depleted_at: string | null;
  game_id: string | null;
  game: {
    game_id: string;
    game_code: string;
    name: string;
    price: number | null;
  } | null;
}

interface GameSummary {
  game_id: string;
  game_name: string;
  game_code: string;
  price: number | null;
  totalPacks: number;
  activePacks: number;
  receivedPacks: number;
  packs: LotteryPack[];
}

type StatusFilter = "all" | "RECEIVED" | "ACTIVE" | "SOLD";

/**
 * Filter packs by status
 * Extracted logic from LotteryTable component
 */
function filterPacksByStatus(
  packs: LotteryPack[],
  statusFilter: StatusFilter,
): LotteryPack[] {
  return packs.filter((pack) => {
    if (statusFilter !== "all") {
      const targetStatus = statusFilter === "SOLD" ? "DEPLETED" : statusFilter;
      return pack.status === targetStatus;
    } else {
      // Default: only show ACTIVE and RECEIVED
      return pack.status === "ACTIVE" || pack.status === "RECEIVED";
    }
  });
}

/**
 * Filter packs by date range
 * Extracted logic from LotteryTable component
 */
function filterPacksByDateRange(
  packs: LotteryPack[],
  dateFrom: string,
  dateTo: string,
): LotteryPack[] {
  return packs.filter((pack) => {
    if (dateFrom) {
      const fromDate = new Date(dateFrom);
      const packDate = pack.received_at ? new Date(pack.received_at) : null;
      if (!packDate || packDate < fromDate) return false;
    }
    if (dateTo) {
      const toDate = new Date(dateTo);
      toDate.setHours(23, 59, 59, 999); // End of day
      const packDate = pack.received_at ? new Date(pack.received_at) : null;
      if (!packDate || packDate > toDate) return false;
    }
    return true;
  });
}

/**
 * Group packs by game and calculate summaries
 * Extracted logic from LotteryTable component
 */
function groupPacksByGame(packs: LotteryPack[]): GameSummary[] {
  const gameMap = new Map<string, GameSummary>();

  for (const pack of packs) {
    const gameId = pack.game?.game_id || "unknown";

    if (!gameMap.has(gameId)) {
      gameMap.set(gameId, {
        game_id: gameId,
        game_name: pack.game?.name || "Unknown Game",
        game_code: pack.game?.game_code || "N/A",
        price: pack.game?.price ?? null,
        totalPacks: 0,
        activePacks: 0,
        receivedPacks: 0,
        packs: [],
      });
    }

    const summary = gameMap.get(gameId)!;
    summary.totalPacks++;
    summary.packs.push(pack);
    if (pack.status === "ACTIVE") {
      summary.activePacks++;
    } else if (pack.status === "RECEIVED") {
      summary.receivedPacks++;
    }
  }

  // Sort by game name alphabetically
  return Array.from(gameMap.values()).sort((a, b) =>
    a.game_name.localeCompare(b.game_name),
  );
}

/**
 * Filter game summaries by name/code search
 * Extracted logic from LotteryTable component
 */
function filterGamesBySearch(
  games: GameSummary[],
  searchTerm: string,
): GameSummary[] {
  if (!searchTerm.trim()) return games;

  const search = searchTerm.toLowerCase().trim();
  return games.filter(
    (game) =>
      game.game_name.toLowerCase().includes(search) ||
      game.game_code.toLowerCase().includes(search),
  );
}

// ============ TEST DATA ============

const createMockPack = (overrides: Partial<LotteryPack>): LotteryPack => ({
  pack_id: "pack-1",
  pack_number: "P001",
  status: "ACTIVE",
  received_at: "2025-01-15T10:00:00Z",
  activated_at: "2025-01-16T10:00:00Z",
  depleted_at: null,
  game_id: "game-1",
  game: {
    game_id: "game-1",
    game_code: "001",
    name: "Mega Millions",
    price: 5.0,
  },
  ...overrides,
});

describe("6.10.1-UNIT: LotteryTable Filter Logic", () => {
  // ============ STATUS FILTER TESTS ============

  describe("Status Filter", () => {
    const mixedStatusPacks: LotteryPack[] = [
      createMockPack({ pack_id: "p1", status: "ACTIVE" }),
      createMockPack({ pack_id: "p2", status: "RECEIVED" }),
      createMockPack({ pack_id: "p3", status: "DEPLETED" }),
      createMockPack({ pack_id: "p4", status: "RETURNED" }),
      createMockPack({ pack_id: "p5", status: "ACTIVE" }),
    ];

    it("6.10.1-UNIT-FILTER-001: [P1] should filter to only ACTIVE packs", () => {
      // GIVEN: Mixed status packs
      // WHEN: Filtering by ACTIVE
      const result = filterPacksByStatus(mixedStatusPacks, "ACTIVE");

      // THEN: Only ACTIVE packs remain
      expect(result).toHaveLength(2);
      expect(result.every((p) => p.status === "ACTIVE")).toBe(true);
    });

    it("6.10.1-UNIT-FILTER-002: [P1] should filter to only RECEIVED packs", () => {
      // GIVEN: Mixed status packs
      // WHEN: Filtering by RECEIVED
      const result = filterPacksByStatus(mixedStatusPacks, "RECEIVED");

      // THEN: Only RECEIVED packs remain
      expect(result).toHaveLength(1);
      expect(result[0].status).toBe("RECEIVED");
    });

    it("6.10.1-UNIT-FILTER-003: [P1] should map SOLD to DEPLETED status", () => {
      // GIVEN: Mixed status packs
      // WHEN: Filtering by SOLD
      const result = filterPacksByStatus(mixedStatusPacks, "SOLD");

      // THEN: Only DEPLETED packs remain (SOLD maps to DEPLETED)
      expect(result).toHaveLength(1);
      expect(result[0].status).toBe("DEPLETED");
    });

    it("6.10.1-UNIT-FILTER-004: [P1] should show ACTIVE and RECEIVED for 'all' filter", () => {
      // GIVEN: Mixed status packs
      // WHEN: Using 'all' filter (default)
      const result = filterPacksByStatus(mixedStatusPacks, "all");

      // THEN: Only ACTIVE and RECEIVED packs remain
      expect(result).toHaveLength(3);
      expect(
        result.every((p) => p.status === "ACTIVE" || p.status === "RECEIVED"),
      ).toBe(true);
    });

    it("6.10.1-UNIT-FILTER-005: [P1] should exclude RETURNED packs in 'all' filter", () => {
      // GIVEN: Mixed status packs
      // WHEN: Using 'all' filter
      const result = filterPacksByStatus(mixedStatusPacks, "all");

      // THEN: RETURNED packs are excluded
      expect(result.some((p) => p.status === "RETURNED")).toBe(false);
    });

    it("6.10.1-UNIT-FILTER-006: [P2] should return empty array when no packs match status", () => {
      // GIVEN: Only ACTIVE packs
      const activePacks = [createMockPack({ pack_id: "p1", status: "ACTIVE" })];

      // WHEN: Filtering by SOLD
      const result = filterPacksByStatus(activePacks, "SOLD");

      // THEN: Empty array returned
      expect(result).toHaveLength(0);
    });
  });

  // ============ DATE RANGE FILTER TESTS ============

  describe("Date Range Filter", () => {
    const packsWithDates: LotteryPack[] = [
      createMockPack({
        pack_id: "p1",
        received_at: "2025-01-10T10:00:00Z",
      }),
      createMockPack({
        pack_id: "p2",
        received_at: "2025-01-15T10:00:00Z",
      }),
      createMockPack({
        pack_id: "p3",
        received_at: "2025-01-20T10:00:00Z",
      }),
      createMockPack({
        pack_id: "p4",
        received_at: "2025-01-25T10:00:00Z",
      }),
    ];

    it("6.10.1-UNIT-DATE-001: [P1] should filter packs within date range", () => {
      // GIVEN: Packs with different dates
      // WHEN: Filtering by date range
      const result = filterPacksByDateRange(
        packsWithDates,
        "2025-01-14",
        "2025-01-21",
      );

      // THEN: Only packs within range remain
      expect(result).toHaveLength(2);
      expect(result.map((p) => p.pack_id)).toEqual(["p2", "p3"]);
    });

    it("6.10.1-UNIT-DATE-002: [P1] should filter with only 'from' date", () => {
      // GIVEN: Packs with different dates
      // WHEN: Filtering with only from date
      const result = filterPacksByDateRange(packsWithDates, "2025-01-18", "");

      // THEN: Only packs on or after from date remain
      expect(result).toHaveLength(2);
      expect(result.map((p) => p.pack_id)).toEqual(["p3", "p4"]);
    });

    it("6.10.1-UNIT-DATE-003: [P1] should filter with only 'to' date", () => {
      // GIVEN: Packs with different dates
      // WHEN: Filtering with only to date
      const result = filterPacksByDateRange(packsWithDates, "", "2025-01-16");

      // THEN: Only packs on or before to date remain
      expect(result).toHaveLength(2);
      expect(result.map((p) => p.pack_id)).toEqual(["p1", "p2"]);
    });

    it("6.10.1-UNIT-DATE-004: [P1] should include packs at end of 'to' date (end of day)", () => {
      // GIVEN: Pack received late on to date
      const packLateInDay = [
        createMockPack({
          pack_id: "p1",
          received_at: "2025-01-15T23:59:00Z",
        }),
      ];

      // WHEN: Filtering with to date of same day
      const result = filterPacksByDateRange(packLateInDay, "", "2025-01-15");

      // THEN: Pack is included (end of day logic)
      expect(result).toHaveLength(1);
    });

    it("6.10.1-UNIT-DATE-005: [P2] should exclude packs with null received_at when filtering", () => {
      // GIVEN: Pack with null received_at
      const packsWithNull = [
        createMockPack({ pack_id: "p1", received_at: null }),
        createMockPack({ pack_id: "p2", received_at: "2025-01-15T10:00:00Z" }),
      ];

      // WHEN: Filtering by date range
      const result = filterPacksByDateRange(
        packsWithNull,
        "2025-01-10",
        "2025-01-20",
      );

      // THEN: Null date pack is excluded
      expect(result).toHaveLength(1);
      expect(result[0].pack_id).toBe("p2");
    });

    it("6.10.1-UNIT-DATE-006: [P2] should return all packs when no date filters set", () => {
      // GIVEN: Packs with different dates
      // WHEN: No date filters
      const result = filterPacksByDateRange(packsWithDates, "", "");

      // THEN: All packs returned
      expect(result).toHaveLength(4);
    });
  });

  // ============ GROUPING TESTS ============

  describe("Game Grouping", () => {
    const multiGamePacks: LotteryPack[] = [
      createMockPack({
        pack_id: "p1",
        status: "ACTIVE",
        game_id: "game-1",
        game: {
          game_id: "game-1",
          game_code: "001",
          name: "Mega Millions",
          price: 5,
        },
      }),
      createMockPack({
        pack_id: "p2",
        status: "ACTIVE",
        game_id: "game-1",
        game: {
          game_id: "game-1",
          game_code: "001",
          name: "Mega Millions",
          price: 5,
        },
      }),
      createMockPack({
        pack_id: "p3",
        status: "RECEIVED",
        game_id: "game-2",
        game: {
          game_id: "game-2",
          game_code: "002",
          name: "Powerball",
          price: 10,
        },
      }),
      createMockPack({
        pack_id: "p4",
        status: "ACTIVE",
        game_id: "game-3",
        game: { game_id: "game-3", game_code: "003", name: "Cash 5", price: 2 },
      }),
    ];

    it("6.10.1-UNIT-GROUP-001: [P1] should group packs by game_id", () => {
      // GIVEN: Packs from multiple games
      // WHEN: Grouping by game
      const result = groupPacksByGame(multiGamePacks);

      // THEN: Packs are grouped by game
      expect(result).toHaveLength(3);
      expect(result.find((g) => g.game_id === "game-1")?.totalPacks).toBe(2);
      expect(result.find((g) => g.game_id === "game-2")?.totalPacks).toBe(1);
      expect(result.find((g) => g.game_id === "game-3")?.totalPacks).toBe(1);
    });

    it("6.10.1-UNIT-GROUP-002: [P1] should sort games alphabetically by name", () => {
      // GIVEN: Packs from multiple games
      // WHEN: Grouping by game
      const result = groupPacksByGame(multiGamePacks);

      // THEN: Games are sorted alphabetically
      expect(result[0].game_name).toBe("Cash 5");
      expect(result[1].game_name).toBe("Mega Millions");
      expect(result[2].game_name).toBe("Powerball");
    });

    it("6.10.1-UNIT-GROUP-003: [P1] should count active and received packs separately", () => {
      // GIVEN: Packs with different statuses
      // WHEN: Grouping by game
      const result = groupPacksByGame(multiGamePacks);

      // THEN: Counts are correct
      const megaMillions = result.find((g) => g.game_id === "game-1");
      expect(megaMillions?.activePacks).toBe(2);
      expect(megaMillions?.receivedPacks).toBe(0);

      const powerball = result.find((g) => g.game_id === "game-2");
      expect(powerball?.activePacks).toBe(0);
      expect(powerball?.receivedPacks).toBe(1);
    });

    it("6.10.1-UNIT-GROUP-004: [P2] should handle packs with null game", () => {
      // GIVEN: Pack with null game
      const packsWithNull = [
        createMockPack({ pack_id: "p1", game_id: null, game: null }),
      ];

      // WHEN: Grouping by game
      const result = groupPacksByGame(packsWithNull);

      // THEN: Unknown game group is created
      expect(result).toHaveLength(1);
      expect(result[0].game_id).toBe("unknown");
      expect(result[0].game_name).toBe("Unknown Game");
      expect(result[0].game_code).toBe("N/A");
    });

    it("6.10.1-UNIT-GROUP-005: [P2] should include packs array in summary", () => {
      // GIVEN: Packs from multiple games
      // WHEN: Grouping by game
      const result = groupPacksByGame(multiGamePacks);

      // THEN: Packs are included in summary
      const megaMillions = result.find((g) => g.game_id === "game-1");
      expect(megaMillions?.packs).toHaveLength(2);
      expect(megaMillions?.packs.map((p) => p.pack_id)).toEqual(["p1", "p2"]);
    });
  });

  // ============ SEARCH FILTER TESTS ============

  describe("Game Name/Code Search", () => {
    const gameSummaries: GameSummary[] = [
      {
        game_id: "game-1",
        game_name: "Mega Millions",
        game_code: "001",
        price: 5,
        totalPacks: 2,
        activePacks: 2,
        receivedPacks: 0,
        packs: [],
      },
      {
        game_id: "game-2",
        game_name: "Powerball",
        game_code: "002",
        price: 10,
        totalPacks: 1,
        activePacks: 0,
        receivedPacks: 1,
        packs: [],
      },
      {
        game_id: "game-3",
        game_name: "Cash 5",
        game_code: "003",
        price: 2,
        totalPacks: 1,
        activePacks: 1,
        receivedPacks: 0,
        packs: [],
      },
    ];

    it("6.10.1-UNIT-SEARCH-001: [P1] should filter by game name (case insensitive)", () => {
      // GIVEN: Game summaries
      // WHEN: Searching by name
      const result = filterGamesBySearch(gameSummaries, "mega");

      // THEN: Only matching game remains
      expect(result).toHaveLength(1);
      expect(result[0].game_name).toBe("Mega Millions");
    });

    it("6.10.1-UNIT-SEARCH-002: [P1] should filter by game code", () => {
      // GIVEN: Game summaries
      // WHEN: Searching by code
      const result = filterGamesBySearch(gameSummaries, "002");

      // THEN: Only matching game remains
      expect(result).toHaveLength(1);
      expect(result[0].game_name).toBe("Powerball");
    });

    it("6.10.1-UNIT-SEARCH-003: [P1] should handle partial matches", () => {
      // GIVEN: Game summaries
      // WHEN: Searching partial name
      const result = filterGamesBySearch(gameSummaries, "ball");

      // THEN: Powerball matches
      expect(result).toHaveLength(1);
      expect(result[0].game_name).toBe("Powerball");
    });

    it("6.10.1-UNIT-SEARCH-004: [P2] should return all games when search is empty", () => {
      // GIVEN: Game summaries
      // WHEN: Empty search
      const result = filterGamesBySearch(gameSummaries, "");

      // THEN: All games returned
      expect(result).toHaveLength(3);
    });

    it("6.10.1-UNIT-SEARCH-005: [P2] should return all games when search is whitespace", () => {
      // GIVEN: Game summaries
      // WHEN: Whitespace search
      const result = filterGamesBySearch(gameSummaries, "   ");

      // THEN: All games returned
      expect(result).toHaveLength(3);
    });

    it("6.10.1-UNIT-SEARCH-006: [P2] should return empty when no matches", () => {
      // GIVEN: Game summaries
      // WHEN: Non-matching search
      const result = filterGamesBySearch(gameSummaries, "NonExistent");

      // THEN: Empty array returned
      expect(result).toHaveLength(0);
    });

    it("6.10.1-UNIT-SEARCH-007: [P2] should trim search term", () => {
      // GIVEN: Game summaries
      // WHEN: Search with leading/trailing whitespace
      const result = filterGamesBySearch(gameSummaries, "  Mega  ");

      // THEN: Match found (whitespace trimmed)
      expect(result).toHaveLength(1);
      expect(result[0].game_name).toBe("Mega Millions");
    });
  });

  // ============ COMBINED FILTER TESTS ============

  describe("Combined Filters", () => {
    it("6.10.1-UNIT-COMBINED-001: [P1] should apply status and date filters together", () => {
      // GIVEN: Packs with different status and dates
      const packs: LotteryPack[] = [
        createMockPack({
          pack_id: "p1",
          status: "ACTIVE",
          received_at: "2025-01-10T10:00:00Z",
        }),
        createMockPack({
          pack_id: "p2",
          status: "ACTIVE",
          received_at: "2025-01-20T10:00:00Z",
        }),
        createMockPack({
          pack_id: "p3",
          status: "RECEIVED",
          received_at: "2025-01-15T10:00:00Z",
        }),
      ];

      // WHEN: Applying both filters
      const statusFiltered = filterPacksByStatus(packs, "ACTIVE");
      const result = filterPacksByDateRange(
        statusFiltered,
        "2025-01-15",
        "2025-01-25",
      );

      // THEN: Only packs matching both criteria remain
      expect(result).toHaveLength(1);
      expect(result[0].pack_id).toBe("p2");
    });

    it("6.10.1-UNIT-COMBINED-002: [P1] should apply all filters in sequence", () => {
      // GIVEN: Complex pack data
      const packs: LotteryPack[] = [
        createMockPack({
          pack_id: "p1",
          status: "ACTIVE",
          received_at: "2025-01-15T10:00:00Z",
          game: {
            game_id: "g1",
            game_code: "001",
            name: "Mega Millions",
            price: 5,
          },
        }),
        createMockPack({
          pack_id: "p2",
          status: "ACTIVE",
          received_at: "2025-01-15T10:00:00Z",
          game: {
            game_id: "g2",
            game_code: "002",
            name: "Powerball",
            price: 10,
          },
        }),
        createMockPack({
          pack_id: "p3",
          status: "DEPLETED",
          received_at: "2025-01-15T10:00:00Z",
          game: {
            game_id: "g1",
            game_code: "001",
            name: "Mega Millions",
            price: 5,
          },
        }),
      ];

      // WHEN: Applying all filters
      const statusFiltered = filterPacksByStatus(packs, "ACTIVE");
      const dateFiltered = filterPacksByDateRange(
        statusFiltered,
        "2025-01-10",
        "2025-01-20",
      );
      const grouped = groupPacksByGame(dateFiltered);
      const result = filterGamesBySearch(grouped, "Mega");

      // THEN: Correct result after all filters
      expect(result).toHaveLength(1);
      expect(result[0].game_name).toBe("Mega Millions");
      expect(result[0].totalPacks).toBe(1);
    });
  });

  // ============ EDGE CASE TESTS ============

  describe("Edge Cases", () => {
    it("6.10.1-UNIT-EDGE-001: [P2] should handle empty pack array", () => {
      // GIVEN: Empty array
      const packs: LotteryPack[] = [];

      // WHEN: Applying filters
      const statusFiltered = filterPacksByStatus(packs, "ACTIVE");
      const dateFiltered = filterPacksByDateRange(
        statusFiltered,
        "2025-01-01",
        "2025-01-31",
      );
      const grouped = groupPacksByGame(dateFiltered);

      // THEN: Empty results
      expect(statusFiltered).toHaveLength(0);
      expect(dateFiltered).toHaveLength(0);
      expect(grouped).toHaveLength(0);
    });

    it("6.10.1-UNIT-EDGE-002: [P2] should handle single pack", () => {
      // GIVEN: Single pack
      const packs = [createMockPack({ pack_id: "p1" })];

      // WHEN: Grouping
      const result = groupPacksByGame(packs);

      // THEN: Single game summary
      expect(result).toHaveLength(1);
      expect(result[0].totalPacks).toBe(1);
    });

    it("6.10.1-UNIT-EDGE-003: [P2] should handle all same status packs", () => {
      // GIVEN: All DEPLETED packs
      const packs = [
        createMockPack({ pack_id: "p1", status: "DEPLETED" }),
        createMockPack({ pack_id: "p2", status: "DEPLETED" }),
      ];

      // WHEN: Filtering by default (all)
      const result = filterPacksByStatus(packs, "all");

      // THEN: No packs in default view
      expect(result).toHaveLength(0);
    });

    it("6.10.1-UNIT-EDGE-004: [P2] should handle pack with null price", () => {
      // GIVEN: Pack with null price
      const packs = [
        createMockPack({
          pack_id: "p1",
          game: { game_id: "g1", game_code: "001", name: "Test", price: null },
        }),
      ];

      // WHEN: Grouping
      const result = groupPacksByGame(packs);

      // THEN: Price is null in summary
      expect(result[0].price).toBeNull();
    });
  });
});
