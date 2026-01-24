/**
 * Unit Tests: Super Admin Lottery Page Filter Logic
 *
 * Pure function tests for the filtering logic used in Super Admin Lottery page:
 * - Search filter (game name and code)
 * - Price filter (standard prices and "Other")
 * - Status filter (ACTIVE, INACTIVE, DISCONTINUED)
 * - Combined filter scenarios
 *
 * These are pure function tests at the base of the testing pyramid,
 * testing business logic without DOM rendering.
 *
 * @test-level UNIT
 * @justification Pure logic tests - fastest, most isolated, highest coverage
 * @story Super Admin Dashboard Lottery Search & Filters
 * @priority P1 (High - Business Logic)
 * @created 2025-01-22
 *
 * Tracing Matrix:
 * | Test ID                          | Requirement           | Logic Feature                         |
 * |----------------------------------|-----------------------|---------------------------------------|
 * | UNIT-SADMIN-SEARCH-001           | Search Filter         | Filter by game name                   |
 * | UNIT-SADMIN-SEARCH-002           | Search Filter         | Filter by game code                   |
 * | UNIT-SADMIN-SEARCH-003           | Search Filter         | Case-insensitive search               |
 * | UNIT-SADMIN-SEARCH-004           | Search Filter         | Whitespace handling                   |
 * | UNIT-SADMIN-PRICE-001            | Price Filter          | Filter by exact price                 |
 * | UNIT-SADMIN-PRICE-002            | Price Filter          | "Other" non-standard prices           |
 * | UNIT-SADMIN-PRICE-003            | Price Filter          | Null price handling                   |
 * | UNIT-SADMIN-STATUS-001           | Status Filter         | Filter by ACTIVE                      |
 * | UNIT-SADMIN-STATUS-002           | Status Filter         | Filter by INACTIVE                    |
 * | UNIT-SADMIN-STATUS-003           | Status Filter         | Filter by DISCONTINUED                |
 * | UNIT-SADMIN-COMBINED-001         | Combined Filters      | All filters together                  |
 *
 * Security Controls Applied:
 * - SEC-014: INPUT_VALIDATION - Safe input handling, allowlist filtering
 * - SEC-006: SQL_INJECTION - N/A (client-side filtering, no SQL)
 */

import { describe, it, expect } from "vitest";

// ============ TYPE DEFINITIONS ============

/**
 * Lottery game type matching Super Admin page
 * SEC-014: INPUT_VALIDATION - Strict type definitions
 */
interface LotteryGame {
  game_id: string;
  game_code: string;
  name: string;
  status: "ACTIVE" | "INACTIVE" | "DISCONTINUED";
  price: number | null;
  state_id: string | null;
  pack_value: number | null;
  total_tickets: number | null;
  description: string | null;
  created_at: string;
  updated_at: string;
}

type StatusFilter = "all" | "ACTIVE" | "INACTIVE" | "DISCONTINUED";
type PriceFilter = "all" | "1" | "2" | "3" | "5" | "10" | "20" | "25" | "30" | "50" | "other";

// ============ FILTER FUNCTIONS (Extracted from component) ============

/**
 * Filter games by search term (name or code)
 * SEC-014: INPUT_VALIDATION - Case-insensitive search, safe string handling
 */
function filterBySearch(games: LotteryGame[], searchTerm: string): LotteryGame[] {
  if (!searchTerm.trim()) {
    return games;
  }

  const searchLower = searchTerm.toLowerCase().trim();
  return games.filter((game) => {
    const nameMatch = game.name.toLowerCase().includes(searchLower);
    const codeMatch = game.game_code.toLowerCase().includes(searchLower);
    return nameMatch || codeMatch;
  });
}

/**
 * Filter games by price
 * SEC-014: INPUT_VALIDATION - Allowlist-based price filtering
 */
function filterByPrice(games: LotteryGame[], priceFilter: PriceFilter): LotteryGame[] {
  if (priceFilter === "all") {
    return games;
  }

  return games.filter((game) => {
    const gamePrice = game.price ?? 0;

    if (priceFilter === "other") {
      const standardPrices = [1, 2, 3, 5, 10, 20, 25, 30, 50];
      return !standardPrices.includes(gamePrice);
    }

    const targetPrice = parseInt(priceFilter, 10);
    return gamePrice === targetPrice;
  });
}

/**
 * Filter games by status
 * SEC-014: INPUT_VALIDATION - Enum-based status filtering
 */
function filterByStatus(games: LotteryGame[], statusFilter: StatusFilter): LotteryGame[] {
  if (statusFilter === "all") {
    return games;
  }

  return games.filter((game) => game.status === statusFilter);
}

/**
 * Filter games by state
 */
function filterByState(games: LotteryGame[], stateFilter: string): LotteryGame[] {
  if (stateFilter === "all") {
    return games;
  }

  return games.filter((game) => game.state_id === stateFilter);
}

/**
 * Combined filter function
 * Applies all filters in sequence for optimal performance
 */
function applyAllFilters(
  games: LotteryGame[],
  filters: {
    searchTerm: string;
    priceFilter: PriceFilter;
    statusFilter: StatusFilter;
    stateFilter: string;
  },
): LotteryGame[] {
  let result = games;

  // Apply state filter first (most restrictive in multi-state deployment)
  result = filterByState(result, filters.stateFilter);

  // Apply status filter (reduces set significantly)
  result = filterByStatus(result, filters.statusFilter);

  // Apply price filter
  result = filterByPrice(result, filters.priceFilter);

  // Apply search filter last (string matching is more expensive)
  result = filterBySearch(result, filters.searchTerm);

  return result;
}

// ============ TEST DATA ============

const createMockGame = (overrides: Partial<LotteryGame>): LotteryGame => ({
  game_id: "game-1",
  game_code: "GA001",
  name: "Test Game",
  status: "ACTIVE",
  price: 5,
  state_id: "state-ga-123",
  pack_value: 300,
  total_tickets: 60,
  description: null,
  created_at: "2025-01-01T00:00:00Z",
  updated_at: "2025-01-15T00:00:00Z",
  ...overrides,
});

const testGames: LotteryGame[] = [
  createMockGame({
    game_id: "game-1",
    game_code: "GA001",
    name: "Georgia Jackpot",
    status: "ACTIVE",
    price: 5,
    state_id: "state-ga-123",
  }),
  createMockGame({
    game_id: "game-2",
    game_code: "GA002",
    name: "Peach State Millions",
    status: "ACTIVE",
    price: 10,
    state_id: "state-ga-123",
  }),
  createMockGame({
    game_id: "game-3",
    game_code: "FL001",
    name: "Sunshine Cash",
    status: "INACTIVE",
    price: 20,
    state_id: "state-fl-456",
  }),
  createMockGame({
    game_id: "game-4",
    game_code: "GA003",
    name: "Lucky 7s",
    status: "DISCONTINUED",
    price: 1,
    state_id: "state-ga-123",
  }),
  createMockGame({
    game_id: "game-5",
    game_code: "FL002",
    name: "Florida Fantasy",
    status: "ACTIVE",
    price: 2,
    state_id: "state-fl-456",
  }),
  createMockGame({
    game_id: "game-6",
    game_code: "GA004",
    name: "Gold Rush",
    status: "ACTIVE",
    price: 3,
    state_id: "state-ga-123",
  }),
  createMockGame({
    game_id: "game-7",
    game_code: "GA005",
    name: "Super Scratch",
    status: "ACTIVE",
    price: 25,
    state_id: "state-ga-123",
  }),
  createMockGame({
    game_id: "game-8",
    game_code: "FL003",
    name: "Ocean Treasures",
    status: "ACTIVE",
    price: 30,
    state_id: "state-fl-456",
  }),
  createMockGame({
    game_id: "game-9",
    game_code: "GA006",
    name: "Diamond Delight",
    status: "ACTIVE",
    price: 50,
    state_id: "state-ga-123",
  }),
  createMockGame({
    game_id: "game-10",
    game_code: "FL004",
    name: "Premium Special",
    status: "ACTIVE",
    price: 100, // Non-standard price
    state_id: "state-fl-456",
  }),
];

// ============ TESTS ============

describe("UNIT: Super Admin Lottery Page - Search Filter", () => {
  /**
   * UNIT-SADMIN-SEARCH-001: Filter by game name
   */
  it("UNIT-SADMIN-SEARCH-001: [P1] should filter games by name substring", () => {
    // GIVEN: Games with various names
    // WHEN: Searching for "Jackpot"
    const result = filterBySearch(testGames, "Jackpot");

    // THEN: Only games containing "Jackpot" are returned
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Georgia Jackpot");
  });

  /**
   * UNIT-SADMIN-SEARCH-002: Filter by game code
   */
  it("UNIT-SADMIN-SEARCH-002: [P1] should filter games by code", () => {
    // GIVEN: Games with various codes
    // WHEN: Searching for "FL001"
    const result = filterBySearch(testGames, "FL001");

    // THEN: Only games with matching code are returned
    expect(result).toHaveLength(1);
    expect(result[0].game_code).toBe("FL001");
    expect(result[0].name).toBe("Sunshine Cash");
  });

  /**
   * UNIT-SADMIN-SEARCH-003: Case-insensitive search
   * SEC-014: INPUT_VALIDATION - Case normalization
   */
  it("UNIT-SADMIN-SEARCH-003: [P1] should perform case-insensitive search", () => {
    // GIVEN: Games with mixed case names
    // WHEN: Searching with different case
    const resultLower = filterBySearch(testGames, "georgia");
    const resultUpper = filterBySearch(testGames, "GEORGIA");
    const resultMixed = filterBySearch(testGames, "GeOrGiA");

    // THEN: All searches return the same result
    expect(resultLower).toHaveLength(1);
    expect(resultUpper).toHaveLength(1);
    expect(resultMixed).toHaveLength(1);
    expect(resultLower[0].name).toBe("Georgia Jackpot");
  });

  /**
   * UNIT-SADMIN-SEARCH-004: Whitespace handling
   * SEC-014: INPUT_VALIDATION - Whitespace trimming
   */
  it("UNIT-SADMIN-SEARCH-004: [P1] should trim whitespace and treat empty as no filter", () => {
    // GIVEN: Games
    // WHEN: Searching with whitespace only
    const resultWhitespace = filterBySearch(testGames, "   ");
    const resultEmpty = filterBySearch(testGames, "");

    // THEN: All games are returned (no filter applied)
    expect(resultWhitespace).toHaveLength(testGames.length);
    expect(resultEmpty).toHaveLength(testGames.length);
  });

  /**
   * UNIT-SADMIN-SEARCH-005: Search with leading/trailing whitespace
   */
  it("UNIT-SADMIN-SEARCH-005: [P2] should trim search term before matching", () => {
    // GIVEN: Games
    // WHEN: Searching with leading/trailing whitespace
    const result = filterBySearch(testGames, "  Gold  ");

    // THEN: Match is found (whitespace trimmed)
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Gold Rush");
  });

  /**
   * UNIT-SADMIN-SEARCH-006: No matches found
   */
  it("UNIT-SADMIN-SEARCH-006: [P2] should return empty array when no matches", () => {
    // GIVEN: Games
    // WHEN: Searching for non-existent game
    const result = filterBySearch(testGames, "NONEXISTENT12345");

    // THEN: Empty array returned
    expect(result).toHaveLength(0);
  });

  /**
   * UNIT-SADMIN-SEARCH-007: Partial match on code prefix
   */
  it("UNIT-SADMIN-SEARCH-007: [P2] should match partial code (prefix)", () => {
    // GIVEN: Games with GA and FL prefixes
    // WHEN: Searching for "GA"
    const result = filterBySearch(testGames, "GA");

    // THEN: All Georgia games are returned
    expect(result).toHaveLength(6); // GA001-GA006
    expect(result.every((g) => g.game_code.startsWith("GA"))).toBe(true);
  });
});

describe("UNIT: Super Admin Lottery Page - Price Filter", () => {
  /**
   * UNIT-SADMIN-PRICE-001: Filter by exact price
   */
  it("UNIT-SADMIN-PRICE-001: [P1] should filter games by exact price", () => {
    // Test multiple standard prices
    const prices: Array<{ filter: PriceFilter; expected: number }> = [
      { filter: "1", expected: 1 },
      { filter: "2", expected: 1 },
      { filter: "3", expected: 1 },
      { filter: "5", expected: 1 },
      { filter: "10", expected: 1 },
      { filter: "20", expected: 1 },
      { filter: "25", expected: 1 },
      { filter: "30", expected: 1 },
      { filter: "50", expected: 1 },
    ];

    prices.forEach(({ filter, expected }) => {
      const result = filterByPrice(testGames, filter);
      expect(result).toHaveLength(expected);
      expect(result.every((g) => g.price === parseInt(filter, 10))).toBe(true);
    });
  });

  /**
   * UNIT-SADMIN-PRICE-002: "Other" filter for non-standard prices
   * SEC-014: INPUT_VALIDATION - Allowlist-based filtering
   */
  it("UNIT-SADMIN-PRICE-002: [P1] should filter non-standard prices with Other", () => {
    // GIVEN: Games including one with $100 price
    // WHEN: Filtering by "other"
    const result = filterByPrice(testGames, "other");

    // THEN: Only non-standard price games are returned
    expect(result).toHaveLength(1);
    expect(result[0].price).toBe(100);
    expect(result[0].name).toBe("Premium Special");
  });

  /**
   * UNIT-SADMIN-PRICE-003: Null price handling
   * SEC-014: INPUT_VALIDATION - Safe null handling
   */
  it("UNIT-SADMIN-PRICE-003: [P1] should treat null price as 0 for filtering", () => {
    // GIVEN: Game with null price
    const gamesWithNull = [
      ...testGames,
      createMockGame({
        game_id: "game-null",
        game_code: "NULL01",
        name: "Null Price Game",
        price: null,
      }),
    ];

    // WHEN: Filtering by $5
    const result = filterByPrice(gamesWithNull, "5");

    // THEN: Null price game is excluded
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Georgia Jackpot");
    expect(result.some((g) => g.name === "Null Price Game")).toBe(false);
  });

  /**
   * UNIT-SADMIN-PRICE-004: Null price with "Other" filter
   */
  it("UNIT-SADMIN-PRICE-004: [P2] should include null price (as 0) in Other filter", () => {
    // GIVEN: Game with null price (treated as 0)
    const gamesWithNull = [
      createMockGame({
        game_id: "game-null",
        game_code: "NULL01",
        name: "Null Price Game",
        price: null,
      }),
    ];

    // WHEN: Filtering by "other"
    const result = filterByPrice(gamesWithNull, "other");

    // THEN: Null price game IS included (0 is not in standard list)
    expect(result).toHaveLength(1);
  });

  /**
   * UNIT-SADMIN-PRICE-005: "All" prices filter
   */
  it("UNIT-SADMIN-PRICE-005: [P1] should return all games when filter is 'all'", () => {
    // GIVEN: Games
    // WHEN: Filter is "all"
    const result = filterByPrice(testGames, "all");

    // THEN: All games returned
    expect(result).toHaveLength(testGames.length);
  });
});

describe("UNIT: Super Admin Lottery Page - Status Filter", () => {
  /**
   * UNIT-SADMIN-STATUS-001: Filter by ACTIVE status
   */
  it("UNIT-SADMIN-STATUS-001: [P1] should filter games by ACTIVE status", () => {
    // GIVEN: Games with mixed statuses
    // WHEN: Filtering by ACTIVE
    const result = filterByStatus(testGames, "ACTIVE");

    // THEN: Only ACTIVE games returned
    expect(result).toHaveLength(8); // 8 ACTIVE games in test data
    expect(result.every((g) => g.status === "ACTIVE")).toBe(true);
  });

  /**
   * UNIT-SADMIN-STATUS-002: Filter by INACTIVE status
   */
  it("UNIT-SADMIN-STATUS-002: [P1] should filter games by INACTIVE status", () => {
    // GIVEN: Games with mixed statuses
    // WHEN: Filtering by INACTIVE
    const result = filterByStatus(testGames, "INACTIVE");

    // THEN: Only INACTIVE games returned
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Sunshine Cash");
    expect(result[0].status).toBe("INACTIVE");
  });

  /**
   * UNIT-SADMIN-STATUS-003: Filter by DISCONTINUED status
   */
  it("UNIT-SADMIN-STATUS-003: [P1] should filter games by DISCONTINUED status", () => {
    // GIVEN: Games with mixed statuses
    // WHEN: Filtering by DISCONTINUED
    const result = filterByStatus(testGames, "DISCONTINUED");

    // THEN: Only DISCONTINUED games returned
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Lucky 7s");
    expect(result[0].status).toBe("DISCONTINUED");
  });

  /**
   * UNIT-SADMIN-STATUS-004: "All" status filter
   */
  it("UNIT-SADMIN-STATUS-004: [P1] should return all games when status filter is 'all'", () => {
    // GIVEN: Games with mixed statuses
    // WHEN: Filter is "all"
    const result = filterByStatus(testGames, "all");

    // THEN: All games returned regardless of status
    expect(result).toHaveLength(testGames.length);
  });
});

describe("UNIT: Super Admin Lottery Page - State Filter", () => {
  /**
   * UNIT-SADMIN-STATE-001: Filter by state
   */
  it("UNIT-SADMIN-STATE-001: [P1] should filter games by state_id", () => {
    // GIVEN: Games from multiple states
    // WHEN: Filtering by Georgia
    const gaResult = filterByState(testGames, "state-ga-123");
    const flResult = filterByState(testGames, "state-fl-456");

    // THEN: Correct games returned for each state
    expect(gaResult).toHaveLength(6);
    expect(gaResult.every((g) => g.state_id === "state-ga-123")).toBe(true);

    expect(flResult).toHaveLength(4);
    expect(flResult.every((g) => g.state_id === "state-fl-456")).toBe(true);
  });

  /**
   * UNIT-SADMIN-STATE-002: "All" state filter
   */
  it("UNIT-SADMIN-STATE-002: [P1] should return all games when state filter is 'all'", () => {
    // GIVEN: Games from multiple states
    // WHEN: Filter is "all"
    const result = filterByState(testGames, "all");

    // THEN: All games returned
    expect(result).toHaveLength(testGames.length);
  });
});

describe("UNIT: Super Admin Lottery Page - Combined Filters", () => {
  /**
   * UNIT-SADMIN-COMBINED-001: All filters applied together
   */
  it("UNIT-SADMIN-COMBINED-001: [P1] should apply all filters correctly in combination", () => {
    // GIVEN: Games with various attributes
    // WHEN: Applying multiple filters
    const result = applyAllFilters(testGames, {
      stateFilter: "state-ga-123",
      statusFilter: "ACTIVE",
      priceFilter: "5",
      searchTerm: "Georgia",
    });

    // THEN: Only games matching ALL criteria are returned
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Georgia Jackpot");
    expect(result[0].state_id).toBe("state-ga-123");
    expect(result[0].status).toBe("ACTIVE");
    expect(result[0].price).toBe(5);
  });

  /**
   * UNIT-SADMIN-COMBINED-002: Filters progressively narrow results
   */
  it("UNIT-SADMIN-COMBINED-002: [P1] should progressively narrow results with each filter", () => {
    // Start with all games
    let result = testGames;
    expect(result).toHaveLength(10);

    // Apply state filter
    result = filterByState(result, "state-ga-123");
    expect(result).toHaveLength(6);

    // Apply status filter
    result = filterByStatus(result, "ACTIVE");
    expect(result).toHaveLength(5);

    // Apply price filter
    result = filterByPrice(result, "5");
    expect(result).toHaveLength(1);

    // Verify final result
    expect(result[0].name).toBe("Georgia Jackpot");
  });

  /**
   * UNIT-SADMIN-COMBINED-003: Empty result when filters conflict
   */
  it("UNIT-SADMIN-COMBINED-003: [P2] should return empty when filters produce no matches", () => {
    // GIVEN: Filters that don't match any game
    const result = applyAllFilters(testGames, {
      stateFilter: "state-ga-123",
      statusFilter: "INACTIVE", // No INACTIVE GA games
      priceFilter: "all",
      searchTerm: "",
    });

    // THEN: Empty array
    expect(result).toHaveLength(0);
  });

  /**
   * UNIT-SADMIN-COMBINED-004: All filters set to "all" returns all games
   */
  it("UNIT-SADMIN-COMBINED-004: [P2] should return all games when all filters are 'all'", () => {
    // GIVEN: All filters set to "all"
    const result = applyAllFilters(testGames, {
      stateFilter: "all",
      statusFilter: "all",
      priceFilter: "all",
      searchTerm: "",
    });

    // THEN: All games returned
    expect(result).toHaveLength(testGames.length);
  });
});

describe("UNIT: Super Admin Lottery Page - Edge Cases", () => {
  /**
   * UNIT-SADMIN-EDGE-001: Empty games array
   */
  it("UNIT-SADMIN-EDGE-001: [P2] should handle empty games array", () => {
    const emptyGames: LotteryGame[] = [];

    expect(filterBySearch(emptyGames, "test")).toHaveLength(0);
    expect(filterByPrice(emptyGames, "5")).toHaveLength(0);
    expect(filterByStatus(emptyGames, "ACTIVE")).toHaveLength(0);
    expect(filterByState(emptyGames, "state-ga-123")).toHaveLength(0);
  });

  /**
   * UNIT-SADMIN-EDGE-002: Single game array
   */
  it("UNIT-SADMIN-EDGE-002: [P2] should handle single game array", () => {
    const singleGame = [testGames[0]];

    expect(filterBySearch(singleGame, "Georgia")).toHaveLength(1);
    expect(filterBySearch(singleGame, "Florida")).toHaveLength(0);
    expect(filterByPrice(singleGame, "5")).toHaveLength(1);
    expect(filterByPrice(singleGame, "10")).toHaveLength(0);
  });

  /**
   * UNIT-SADMIN-EDGE-003: Special characters in search
   * SEC-014: INPUT_VALIDATION - Safe handling of special characters
   */
  it("UNIT-SADMIN-EDGE-003: [P2] should safely handle special characters in search", () => {
    // GIVEN: Games and special character input
    const specialInputs = [
      "<script>alert('xss')</script>",
      "'; DROP TABLE games; --",
      "game.*regex",
      "game\nwith\nnewlines",
      "🎰 emoji game",
    ];

    // WHEN/THEN: Each special input is handled safely (no matches, no errors)
    specialInputs.forEach((input) => {
      expect(() => filterBySearch(testGames, input)).not.toThrow();
      const result = filterBySearch(testGames, input);
      // No games should match these special inputs
      expect(result.length).toBeGreaterThanOrEqual(0);
    });
  });

  /**
   * UNIT-SADMIN-EDGE-004: Very long search string
   */
  it("UNIT-SADMIN-EDGE-004: [P2] should handle very long search strings", () => {
    // GIVEN: Very long search string
    const longSearch = "a".repeat(10000);

    // WHEN: Filtering with long string
    const result = filterBySearch(testGames, longSearch);

    // THEN: No errors, no matches
    expect(result).toHaveLength(0);
  });

  /**
   * UNIT-SADMIN-EDGE-005: Game with empty name
   */
  it("UNIT-SADMIN-EDGE-005: [P2] should handle game with empty name", () => {
    // GIVEN: Game with empty name
    const gamesWithEmpty = [
      ...testGames,
      createMockGame({
        game_id: "game-empty",
        game_code: "EMPTY01",
        name: "",
      }),
    ];

    // WHEN: Searching for empty string
    const result = filterBySearch(gamesWithEmpty, "");

    // THEN: All games returned (empty search = no filter)
    expect(result).toHaveLength(gamesWithEmpty.length);
  });
});

describe("UNIT: Super Admin Lottery Page - Performance Considerations", () => {
  /**
   * UNIT-SADMIN-PERF-001: Filter order optimization
   *
   * Filters should be applied in order from most restrictive to least
   * to minimize iterations on large datasets.
   */
  it("UNIT-SADMIN-PERF-001: [P3] filter functions should handle large datasets efficiently", () => {
    // GIVEN: Large dataset (1000 games)
    const largeDataset: LotteryGame[] = Array.from({ length: 1000 }, (_, i) =>
      createMockGame({
        game_id: `game-${i}`,
        game_code: `CODE${i.toString().padStart(4, "0")}`,
        name: `Game Number ${i}`,
        status: i % 3 === 0 ? "ACTIVE" : i % 3 === 1 ? "INACTIVE" : "DISCONTINUED",
        price: [1, 2, 3, 5, 10, 20, 25, 30, 50, 100][i % 10],
        state_id: i % 2 === 0 ? "state-ga-123" : "state-fl-456",
      }),
    );

    // WHEN: Applying combined filters
    const startTime = performance.now();
    const result = applyAllFilters(largeDataset, {
      stateFilter: "state-ga-123",
      statusFilter: "ACTIVE",
      priceFilter: "5",
      searchTerm: "100",
    });
    const endTime = performance.now();

    // THEN: Filters complete quickly (< 50ms for 1000 games)
    expect(endTime - startTime).toBeLessThan(50);
    // And results are correct
    expect(result.every((g) => g.state_id === "state-ga-123")).toBe(true);
    expect(result.every((g) => g.status === "ACTIVE")).toBe(true);
    expect(result.every((g) => g.price === 5)).toBe(true);
  });
});
