/**
 * Lottery Totals Calculation Business Logic Tests
 *
 * @test-level Unit
 * @justification Unit tests verifying lottery sales and ticket calculation formulas
 * @story client-owner-dashboard-closed-shift-lottery-view
 *
 * Tests the business logic for calculating:
 * - Bin lottery sales from LotteryDayPack
 * - Returned pack sales inclusion
 * - Total tickets calculation
 * - Net lottery calculation (sales - cashes)
 *
 * =============================================================================
 * REQUIREMENTS TRACEABILITY MATRIX (RTM)
 * =============================================================================
 *
 * | Test ID              | Requirement                                    | Priority | Type        |
 * |----------------------|------------------------------------------------|----------|-------------|
 * | LTC-001              | Bin sales = sum of day pack sales_amount      | P0       | Business    |
 * | LTC-002              | Bin tickets = sum of day pack tickets_sold    | P0       | Business    |
 * | LTC-003              | Returned sales = sum of return_sales_amount   | P0       | Business    |
 * | LTC-004              | Returned tickets = sum of tickets_sold_return | P0       | Business    |
 * | LTC-005              | Total sales = bin sales + returned sales      | P0       | Business    |
 * | LTC-006              | Total tickets = bin tickets + returned tix    | P0       | Business    |
 * | LTC-007              | Net = total sales - cashes                    | P0       | Business    |
 * | LTC-008              | Handle null/undefined values gracefully       | P1       | Edge Case   |
 * | LTC-009              | Handle Decimal type conversions               | P1       | Edge Case   |
 * | LTC-010              | Handle empty arrays                           | P1       | Edge Case   |
 *
 * =============================================================================
 */

import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";

// =============================================================================
// TYPE DEFINITIONS (mimicking actual data structures)
// =============================================================================

interface LotteryDayPackData {
  tickets_sold: number | null;
  sales_amount: Decimal | number | null;
}

interface ReturnedPackData {
  tickets_sold_on_return: number | null;
  return_sales_amount: Decimal | number | null;
}

interface BinClosedData {
  bin_number: number;
  pack_number: string;
  game_name: string;
  game_price: number;
  starting_serial: string;
  closing_serial: string;
  tickets_sold: number;
  sales_amount: number;
}

// =============================================================================
// CALCULATION FUNCTIONS (extracted from shift.service.ts logic)
// =============================================================================

/**
 * Calculate total sales from day packs
 * Matches logic at shift.service.ts:3027-3030
 */
function calculateBinSales(dayPacks: LotteryDayPackData[]): number {
  return dayPacks.reduce((sum, pack) => {
    const amount = pack.sales_amount;
    if (amount === null || amount === undefined) return sum;
    return sum + (typeof amount === "number" ? amount : Number(amount));
  }, 0);
}

/**
 * Calculate total tickets from day packs
 * Matches logic at shift.service.ts:3031-3034
 */
function calculateBinTickets(dayPacks: LotteryDayPackData[]): number {
  return dayPacks.reduce((sum, pack) => {
    return sum + (pack.tickets_sold ?? 0);
  }, 0);
}

/**
 * Calculate total sales from returned packs
 * Matches logic at shift.service.ts:3037-3040
 */
function calculateReturnedSales(returnedPacks: ReturnedPackData[]): number {
  return returnedPacks.reduce((sum, pack) => {
    const amount = pack.return_sales_amount;
    if (amount === null || amount === undefined) return sum;
    return sum + (typeof amount === "number" ? amount : Number(amount));
  }, 0);
}

/**
 * Calculate total tickets from returned packs
 * Matches logic at shift.service.ts:3041-3044
 */
function calculateReturnedTickets(returnedPacks: ReturnedPackData[]): number {
  return returnedPacks.reduce((sum, pack) => {
    return sum + (pack.tickets_sold_on_return ?? 0);
  }, 0);
}

/**
 * Calculate total lottery (bins + returned)
 * Matches logic at shift.service.ts:3047-3048
 */
function calculateTotalLottery(
  dayPacks: LotteryDayPackData[],
  returnedPacks: ReturnedPackData[],
): { totalSales: number; totalTickets: number } {
  const binSales = calculateBinSales(dayPacks);
  const binTickets = calculateBinTickets(dayPacks);
  const returnedSales = calculateReturnedSales(returnedPacks);
  const returnedTickets = calculateReturnedTickets(returnedPacks);

  return {
    totalSales: binSales + returnedSales,
    totalTickets: binTickets + returnedTickets,
  };
}

/**
 * Calculate bins_closed array from day packs
 * Matches logic at shift.service.ts:2765-2793
 */
function calculateBinsClosed(
  dayPacks: Array<{
    starting_serial: string | null;
    ending_serial: string | null;
    tickets_sold: number | null;
    sales_amount: Decimal | number | null;
    pack: {
      pack_number: string;
      bin: { display_order: number } | null;
      game: { name: string; price: Decimal | number } | null;
    } | null;
  }>,
): BinClosedData[] {
  const binsClosed: BinClosedData[] = [];

  for (const dayPack of dayPacks) {
    if (!dayPack.starting_serial || !dayPack.ending_serial) {
      continue;
    }

    const binNumber = dayPack.pack?.bin
      ? dayPack.pack.bin.display_order + 1
      : 0;
    const gamePrice = dayPack.pack?.game ? Number(dayPack.pack.game.price) : 0;
    const ticketsSold = dayPack.tickets_sold ?? 0;
    const salesAmount = Number(dayPack.sales_amount ?? 0);

    binsClosed.push({
      bin_number: binNumber,
      pack_number: dayPack.pack?.pack_number || "",
      game_name: dayPack.pack?.game?.name || "",
      game_price: gamePrice,
      starting_serial: dayPack.starting_serial,
      closing_serial: dayPack.ending_serial,
      tickets_sold: ticketsSold,
      sales_amount: salesAmount,
    });
  }

  // Sort by bin number
  binsClosed.sort((a, b) => a.bin_number - b.bin_number);

  return binsClosed;
}

// =============================================================================
// SECTION 1: BIN SALES CALCULATION
// =============================================================================

describe("LTC-001: Bin Sales Calculation", () => {
  it("should sum sales_amount from all day packs", () => {
    // GIVEN: Day packs with various sales amounts
    const dayPacks: LotteryDayPackData[] = [
      { tickets_sold: 50, sales_amount: new Decimal(250) },
      { tickets_sold: 30, sales_amount: new Decimal(150) },
      { tickets_sold: 20, sales_amount: new Decimal(100) },
    ];

    // WHEN: Calculate bin sales
    const result = calculateBinSales(dayPacks);

    // THEN: Should sum all sales_amount values
    expect(result).toBe(500); // 250 + 150 + 100
  });

  it("should handle number type sales_amount", () => {
    // GIVEN: Day packs with number (not Decimal) sales amounts
    const dayPacks: LotteryDayPackData[] = [
      { tickets_sold: 50, sales_amount: 250 },
      { tickets_sold: 30, sales_amount: 150 },
    ];

    // WHEN: Calculate bin sales
    const result = calculateBinSales(dayPacks);

    // THEN: Should handle number type correctly
    expect(result).toBe(400);
  });
});

describe("LTC-002: Bin Tickets Calculation", () => {
  it("should sum tickets_sold from all day packs", () => {
    // GIVEN: Day packs with various ticket counts
    const dayPacks: LotteryDayPackData[] = [
      { tickets_sold: 50, sales_amount: 250 },
      { tickets_sold: 30, sales_amount: 150 },
      { tickets_sold: 20, sales_amount: 100 },
    ];

    // WHEN: Calculate bin tickets
    const result = calculateBinTickets(dayPacks);

    // THEN: Should sum all tickets_sold values
    expect(result).toBe(100); // 50 + 30 + 20
  });
});

// =============================================================================
// SECTION 2: RETURNED PACK CALCULATIONS
// =============================================================================

describe("LTC-003: Returned Pack Sales Calculation", () => {
  it("should sum return_sales_amount from all returned packs", () => {
    // GIVEN: Returned packs with sales amounts
    const returnedPacks: ReturnedPackData[] = [
      { tickets_sold_on_return: 52, return_sales_amount: new Decimal(260) },
      { tickets_sold_on_return: 23, return_sales_amount: new Decimal(115) },
    ];

    // WHEN: Calculate returned sales
    const result = calculateReturnedSales(returnedPacks);

    // THEN: Should sum all return_sales_amount values
    expect(result).toBe(375); // 260 + 115
  });
});

describe("LTC-004: Returned Pack Tickets Calculation", () => {
  it("should sum tickets_sold_on_return from all returned packs", () => {
    // GIVEN: Returned packs with ticket counts
    const returnedPacks: ReturnedPackData[] = [
      { tickets_sold_on_return: 52, return_sales_amount: 260 },
      { tickets_sold_on_return: 23, return_sales_amount: 115 },
    ];

    // WHEN: Calculate returned tickets
    const result = calculateReturnedTickets(returnedPacks);

    // THEN: Should sum all tickets_sold_on_return values
    expect(result).toBe(75); // 52 + 23
  });
});

// =============================================================================
// SECTION 3: TOTAL CALCULATIONS
// =============================================================================

describe("LTC-005: Total Sales Calculation", () => {
  it("should add bin sales and returned sales", () => {
    // GIVEN: Bins with $1000 sales and returned packs with $260 sales
    const dayPacks: LotteryDayPackData[] = [
      { tickets_sold: 100, sales_amount: 500 },
      { tickets_sold: 100, sales_amount: 500 },
    ];
    const returnedPacks: ReturnedPackData[] = [
      { tickets_sold_on_return: 52, return_sales_amount: 260 },
    ];

    // WHEN: Calculate total
    const { totalSales } = calculateTotalLottery(dayPacks, returnedPacks);

    // THEN: Should be bin sales + returned sales
    expect(totalSales).toBe(1260); // 1000 + 260
  });
});

describe("LTC-006: Total Tickets Calculation", () => {
  it("should add bin tickets and returned tickets", () => {
    // GIVEN: Bins with 200 tickets and returned packs with 52 tickets
    const dayPacks: LotteryDayPackData[] = [
      { tickets_sold: 100, sales_amount: 500 },
      { tickets_sold: 100, sales_amount: 500 },
    ];
    const returnedPacks: ReturnedPackData[] = [
      { tickets_sold_on_return: 52, return_sales_amount: 260 },
    ];

    // WHEN: Calculate total
    const { totalTickets } = calculateTotalLottery(dayPacks, returnedPacks);

    // THEN: Should be bin tickets + returned tickets
    expect(totalTickets).toBe(252); // 200 + 52
  });
});

describe("LTC-007: Net Lottery Calculation", () => {
  it("should calculate net as sales minus cashes", () => {
    // GIVEN: Total sales and cashes
    const totalSales = 1260;
    const lotteryCashes = 200;

    // WHEN: Calculate net
    const net = totalSales - lotteryCashes;

    // THEN: Should be sales - cashes
    expect(net).toBe(1060);
  });

  it("should return sales as net when cashes is 0", () => {
    // GIVEN: Total sales with no cashes
    const totalSales = 1260;
    const lotteryCashes = 0;

    // WHEN: Calculate net
    const net = totalSales - lotteryCashes;

    // THEN: Should equal sales
    expect(net).toBe(1260);
  });
});

// =============================================================================
// SECTION 4: EDGE CASES
// =============================================================================

describe("LTC-008: Null/Undefined Value Handling", () => {
  it("should treat null tickets_sold as 0", () => {
    // GIVEN: Day pack with null tickets_sold
    const dayPacks: LotteryDayPackData[] = [
      { tickets_sold: null, sales_amount: 250 },
      { tickets_sold: 30, sales_amount: 150 },
    ];

    // WHEN: Calculate bin tickets
    const result = calculateBinTickets(dayPacks);

    // THEN: Should treat null as 0
    expect(result).toBe(30); // 0 + 30
  });

  it("should treat null sales_amount as 0", () => {
    // GIVEN: Day pack with null sales_amount
    const dayPacks: LotteryDayPackData[] = [
      { tickets_sold: 50, sales_amount: null },
      { tickets_sold: 30, sales_amount: 150 },
    ];

    // WHEN: Calculate bin sales
    const result = calculateBinSales(dayPacks);

    // THEN: Should treat null as 0
    expect(result).toBe(150); // 0 + 150
  });

  it("should treat null tickets_sold_on_return as 0", () => {
    // GIVEN: Returned pack with null tickets
    const returnedPacks: ReturnedPackData[] = [
      { tickets_sold_on_return: null, return_sales_amount: 260 },
      { tickets_sold_on_return: 23, return_sales_amount: 115 },
    ];

    // WHEN: Calculate returned tickets
    const result = calculateReturnedTickets(returnedPacks);

    // THEN: Should treat null as 0
    expect(result).toBe(23);
  });

  it("should treat null return_sales_amount as 0", () => {
    // GIVEN: Returned pack with null sales
    const returnedPacks: ReturnedPackData[] = [
      { tickets_sold_on_return: 52, return_sales_amount: null },
      { tickets_sold_on_return: 23, return_sales_amount: 115 },
    ];

    // WHEN: Calculate returned sales
    const result = calculateReturnedSales(returnedPacks);

    // THEN: Should treat null as 0
    expect(result).toBe(115);
  });
});

describe("LTC-009: Decimal Type Conversions", () => {
  it("should convert Decimal to number correctly", () => {
    // GIVEN: Day pack with Decimal sales_amount
    const dayPacks: LotteryDayPackData[] = [
      { tickets_sold: 50, sales_amount: new Decimal("250.50") },
    ];

    // WHEN: Calculate bin sales
    const result = calculateBinSales(dayPacks);

    // THEN: Should convert Decimal to number
    expect(result).toBe(250.5);
  });

  it("should handle mixed Decimal and number types", () => {
    // GIVEN: Day packs with mixed types
    const dayPacks: LotteryDayPackData[] = [
      { tickets_sold: 50, sales_amount: new Decimal(250) },
      { tickets_sold: 30, sales_amount: 150 },
    ];

    // WHEN: Calculate bin sales
    const result = calculateBinSales(dayPacks);

    // THEN: Should handle both types
    expect(result).toBe(400);
  });
});

describe("LTC-010: Empty Arrays", () => {
  it("should return 0 for empty day packs array", () => {
    // GIVEN: Empty day packs array
    const dayPacks: LotteryDayPackData[] = [];

    // WHEN: Calculate bin sales and tickets
    const sales = calculateBinSales(dayPacks);
    const tickets = calculateBinTickets(dayPacks);

    // THEN: Should return 0
    expect(sales).toBe(0);
    expect(tickets).toBe(0);
  });

  it("should return 0 for empty returned packs array", () => {
    // GIVEN: Empty returned packs array
    const returnedPacks: ReturnedPackData[] = [];

    // WHEN: Calculate returned sales and tickets
    const sales = calculateReturnedSales(returnedPacks);
    const tickets = calculateReturnedTickets(returnedPacks);

    // THEN: Should return 0
    expect(sales).toBe(0);
    expect(tickets).toBe(0);
  });

  it("should handle bins-only scenario (no returned packs)", () => {
    // GIVEN: Day packs with sales, no returned packs
    const dayPacks: LotteryDayPackData[] = [
      { tickets_sold: 50, sales_amount: 250 },
    ];
    const returnedPacks: ReturnedPackData[] = [];

    // WHEN: Calculate total
    const { totalSales, totalTickets } = calculateTotalLottery(
      dayPacks,
      returnedPacks,
    );

    // THEN: Total should equal bin totals only
    expect(totalSales).toBe(250);
    expect(totalTickets).toBe(50);
  });

  it("should handle returned-only scenario (no bin data)", () => {
    // GIVEN: No day packs, only returned packs
    const dayPacks: LotteryDayPackData[] = [];
    const returnedPacks: ReturnedPackData[] = [
      { tickets_sold_on_return: 52, return_sales_amount: 260 },
    ];

    // WHEN: Calculate total
    const { totalSales, totalTickets } = calculateTotalLottery(
      dayPacks,
      returnedPacks,
    );

    // THEN: Total should equal returned totals only
    expect(totalSales).toBe(260);
    expect(totalTickets).toBe(52);
  });
});

// =============================================================================
// SECTION 5: BINS CLOSED ARRAY CALCULATION
// =============================================================================

describe("Bins Closed Array Calculation", () => {
  it("should build bins_closed array from day packs", () => {
    // GIVEN: Day packs with full data
    const dayPacks = [
      {
        starting_serial: "001",
        ending_serial: "050",
        tickets_sold: 50,
        sales_amount: new Decimal(250),
        pack: {
          pack_number: "PACK-001",
          bin: { display_order: 0 },
          game: { name: "Giant Jumbo Bucks", price: new Decimal(5) },
        },
      },
      {
        starting_serial: "001",
        ending_serial: "030",
        tickets_sold: 30,
        sales_amount: new Decimal(300),
        pack: {
          pack_number: "PACK-002",
          bin: { display_order: 1 },
          game: { name: "Cash Pop", price: new Decimal(10) },
        },
      },
    ];

    // WHEN: Calculate bins closed
    const result = calculateBinsClosed(dayPacks);

    // THEN: Should build correct array
    expect(result.length).toBe(2);
    expect(result[0]).toEqual({
      bin_number: 1, // display_order + 1
      pack_number: "PACK-001",
      game_name: "Giant Jumbo Bucks",
      game_price: 5,
      starting_serial: "001",
      closing_serial: "050",
      tickets_sold: 50,
      sales_amount: 250,
    });
    expect(result[1]).toEqual({
      bin_number: 2, // display_order + 1
      pack_number: "PACK-002",
      game_name: "Cash Pop",
      game_price: 10,
      starting_serial: "001",
      closing_serial: "030",
      tickets_sold: 30,
      sales_amount: 300,
    });
  });

  it("should skip day packs without serial numbers", () => {
    // GIVEN: Day packs with missing serial numbers
    const dayPacks = [
      {
        starting_serial: null,
        ending_serial: "050",
        tickets_sold: 50,
        sales_amount: 250,
        pack: {
          pack_number: "PACK-001",
          bin: { display_order: 0 },
          game: { name: "Game", price: 5 },
        },
      },
      {
        starting_serial: "001",
        ending_serial: null,
        tickets_sold: 30,
        sales_amount: 150,
        pack: {
          pack_number: "PACK-002",
          bin: { display_order: 1 },
          game: { name: "Game", price: 5 },
        },
      },
      {
        starting_serial: "001",
        ending_serial: "050",
        tickets_sold: 50,
        sales_amount: 250,
        pack: {
          pack_number: "PACK-003",
          bin: { display_order: 2 },
          game: { name: "Game", price: 5 },
        },
      },
    ];

    // WHEN: Calculate bins closed
    const result = calculateBinsClosed(dayPacks);

    // THEN: Should only include the pack with both serials
    expect(result.length).toBe(1);
    expect(result[0].pack_number).toBe("PACK-003");
  });

  it("should sort bins by bin_number", () => {
    // GIVEN: Day packs in non-sorted order
    const dayPacks = [
      {
        starting_serial: "001",
        ending_serial: "030",
        tickets_sold: 30,
        sales_amount: 150,
        pack: {
          pack_number: "PACK-C",
          bin: { display_order: 2 },
          game: { name: "Game", price: 5 },
        },
      },
      {
        starting_serial: "001",
        ending_serial: "050",
        tickets_sold: 50,
        sales_amount: 250,
        pack: {
          pack_number: "PACK-A",
          bin: { display_order: 0 },
          game: { name: "Game", price: 5 },
        },
      },
      {
        starting_serial: "001",
        ending_serial: "040",
        tickets_sold: 40,
        sales_amount: 200,
        pack: {
          pack_number: "PACK-B",
          bin: { display_order: 1 },
          game: { name: "Game", price: 5 },
        },
      },
    ];

    // WHEN: Calculate bins closed
    const result = calculateBinsClosed(dayPacks);

    // THEN: Should be sorted by bin_number
    expect(result.length).toBe(3);
    expect(result[0].bin_number).toBe(1);
    expect(result[0].pack_number).toBe("PACK-A");
    expect(result[1].bin_number).toBe(2);
    expect(result[1].pack_number).toBe("PACK-B");
    expect(result[2].bin_number).toBe(3);
    expect(result[2].pack_number).toBe("PACK-C");
  });

  it("should handle null bin (bin_number = 0)", () => {
    // GIVEN: Day pack without bin association
    const dayPacks = [
      {
        starting_serial: "001",
        ending_serial: "050",
        tickets_sold: 50,
        sales_amount: 250,
        pack: {
          pack_number: "PACK-001",
          bin: null,
          game: { name: "Game", price: 5 },
        },
      },
    ];

    // WHEN: Calculate bins closed
    const result = calculateBinsClosed(dayPacks);

    // THEN: bin_number should be 0
    expect(result.length).toBe(1);
    expect(result[0].bin_number).toBe(0);
  });

  it("should handle null game (game_name empty, game_price 0)", () => {
    // GIVEN: Day pack without game association
    const dayPacks = [
      {
        starting_serial: "001",
        ending_serial: "050",
        tickets_sold: 50,
        sales_amount: 250,
        pack: {
          pack_number: "PACK-001",
          bin: { display_order: 0 },
          game: null,
        },
      },
    ];

    // WHEN: Calculate bins closed
    const result = calculateBinsClosed(dayPacks);

    // THEN: game fields should have defaults
    expect(result.length).toBe(1);
    expect(result[0].game_name).toBe("");
    expect(result[0].game_price).toBe(0);
  });
});

// =============================================================================
// SECTION 6: REAL-WORLD SCENARIO TESTS
// =============================================================================

describe("Real-World Scenario Tests", () => {
  it("should match the expected output from the actual bug fix scenario", () => {
    // GIVEN: The actual scenario from the bug fix
    // Bins sold: $1150 (23 bins)
    // Returned pack: $260 (52 tickets)
    // Total should be: $1410, 73 tickets

    const dayPacks: LotteryDayPackData[] = [
      { tickets_sold: 21, sales_amount: new Decimal(1150) }, // Simplified as single bin
    ];

    const returnedPacks: ReturnedPackData[] = [
      { tickets_sold_on_return: 52, return_sales_amount: new Decimal(260) },
    ];

    // WHEN: Calculate totals
    const { totalSales, totalTickets } = calculateTotalLottery(
      dayPacks,
      returnedPacks,
    );

    // THEN: Should match expected values
    expect(totalSales).toBe(1410); // 1150 + 260
    expect(totalTickets).toBe(73); // 21 + 52
  });

  it("should handle overnight shift spanning two days", () => {
    // GIVEN: Shift opened Jan 5 at 10 PM, closed Jan 6 at 6 AM
    // Lottery should use Jan 6 business date
    // Packs activated during shift (Jan 5 11 PM) should be included

    const dayPacks: LotteryDayPackData[] = [
      { tickets_sold: 50, sales_amount: 250 }, // Activated Jan 5 11 PM
      { tickets_sold: 30, sales_amount: 150 }, // Activated Jan 6 3 AM
    ];

    const returnedPacks: ReturnedPackData[] = [
      { tickets_sold_on_return: 20, return_sales_amount: 100 }, // Returned Jan 6 2 AM
    ];

    // WHEN: Calculate totals
    const { totalSales, totalTickets } = calculateTotalLottery(
      dayPacks,
      returnedPacks,
    );

    // THEN: Should include all packs from shift period
    expect(totalSales).toBe(500); // 250 + 150 + 100
    expect(totalTickets).toBe(100); // 50 + 30 + 20
  });
});
