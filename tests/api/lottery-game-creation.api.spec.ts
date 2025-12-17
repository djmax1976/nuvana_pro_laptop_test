/**
 * Lottery Game Creation API Tests
 *
 * Tests for POST /api/lottery/games endpoint:
 * - Game creation with tickets_per_pack calculation
 * - Validation of price and pack_value
 * - Store-scoped game creation (CLIENT_OWNER)
 * - Global game creation (SUPERADMIN)
 * - RLS enforcement
 *
 * @test-level API
 * @justification Tests API endpoints with authentication, authorization, database operations, and business logic
 * @story 6.1 - Lottery Game and Pack Data Models
 * @priority P0-P1 (Critical - Data Integrity, Business Logic)
 */

import { test, expect } from "../support/fixtures/rbac.fixture";
import { faker } from "@faker-js/faker";
import { createCompany, createStore, createUser } from "../support/factories";

test.describe("6.1-API: Lottery Game Creation API", () => {
  test.describe("POST /api/lottery/games - tickets_per_pack Calculation", () => {
    test("6.1-API-001: [P0] should calculate and store tickets_per_pack when creating game (AC #1)", async ({
      storeManagerApiRequest,
      storeManagerUser,
      prismaClient,
    }) => {
      // GIVEN: Valid game data with price=$2 and pack_value=$300
      const gameCode = faker.string.numeric({ length: 4, exclude: ["0000"] });
      const gameName = `Test Game ${faker.string.alphanumeric(6)}`;
      const price = 2; // $2 per ticket
      const packValue = 300; // $300 per pack
      const expectedTicketsPerPack = 150; // 300 / 2 = 150 tickets

      // WHEN: Creating game via API
      const response = await storeManagerApiRequest.post("/api/lottery/games", {
        data: {
          game_code: gameCode,
          name: gameName,
          price: price,
          pack_value: packValue,
          store_id: storeManagerUser.store_id,
        },
      });

      // THEN: Game is created successfully with correct tickets_per_pack
      expect(response.status(), "Expected 201 Created").toBe(201);
      const body = await response.json();
      expect(body.success, "Response should indicate success").toBe(true);
      expect(
        body.data.total_tickets,
        "API response should include computed total_tickets",
      ).toBe(expectedTicketsPerPack);
      expect(body.data.game_code, "Game code should match input").toBe(
        gameCode,
      );

      // Verify in database that tickets_per_pack is actually stored
      const createdGame = await prismaClient.lotteryGame.findUnique({
        where: { game_id: body.data.game_id },
      });

      expect(createdGame, "Game should exist in database").not.toBeNull();
      expect(
        createdGame!.tickets_per_pack,
        "tickets_per_pack should be stored in database",
      ).toBe(expectedTicketsPerPack);
      expect(
        Number(createdGame!.price),
        "price should be stored correctly",
      ).toBe(price);
      expect(
        Number(createdGame!.pack_value),
        "pack_value should be stored correctly",
      ).toBe(packValue);

      // Cleanup
      await prismaClient.lotteryGame.delete({
        where: { game_id: body.data.game_id },
      });
    });

    test("6.1-API-002: [P0] should calculate tickets_per_pack correctly for various price/pack_value combinations (AC #1)", async ({
      storeManagerApiRequest,
      storeManagerUser,
      prismaClient,
    }) => {
      // GIVEN: Multiple price/pack_value combinations
      const testCases = [
        { price: 1, packValue: 150, expectedTickets: 150 }, // $1 ticket, $150 pack
        { price: 5, packValue: 250, expectedTickets: 50 }, // $5 ticket, $250 pack
        { price: 10, packValue: 300, expectedTickets: 30 }, // $10 ticket, $300 pack
        { price: 3, packValue: 300, expectedTickets: 100 }, // $3 ticket, $300 pack
        { price: 20, packValue: 400, expectedTickets: 20 }, // $20 ticket, $400 pack
      ];

      const createdGameIds: string[] = [];

      try {
        for (const testCase of testCases) {
          const gameCode = faker.string.numeric({
            length: 4,
            exclude: ["0000"],
          });
          const gameName = `Test Game ${testCase.price}x${testCase.packValue}`;

          // WHEN: Creating game with specific price/pack_value
          const response = await storeManagerApiRequest.post(
            "/api/lottery/games",
            {
              data: {
                game_code: gameCode,
                name: gameName,
                price: testCase.price,
                pack_value: testCase.packValue,
                store_id: storeManagerUser.store_id,
              },
            },
          );

          // THEN: Game is created with correct tickets_per_pack
          expect(
            response.status(),
            `Expected 201 for price=${testCase.price}, pack_value=${testCase.packValue}`,
          ).toBe(201);
          const body = await response.json();
          createdGameIds.push(body.data.game_id);

          expect(
            body.data.total_tickets,
            `API should return ${testCase.expectedTickets} tickets for $${testCase.price} x $${testCase.packValue}`,
          ).toBe(testCase.expectedTickets);

          // Verify database storage
          const dbGame = await prismaClient.lotteryGame.findUnique({
            where: { game_id: body.data.game_id },
          });

          expect(
            dbGame!.tickets_per_pack,
            `Database should store ${testCase.expectedTickets} tickets_per_pack for $${testCase.price} x $${testCase.packValue}`,
          ).toBe(testCase.expectedTickets);
        }
      } finally {
        // Cleanup all created games
        if (createdGameIds.length > 0) {
          await prismaClient.lotteryGame.deleteMany({
            where: { game_id: { in: createdGameIds } },
          });
        }
      }
    });

    test("6.1-API-003: [P1] should reject game creation when pack_value not divisible by price (AC #2)", async ({
      storeManagerApiRequest,
      storeManagerUser,
    }) => {
      // GIVEN: Invalid pack_value that doesn't divide evenly by price
      const gameCode = faker.string.numeric({ length: 4, exclude: ["0000"] });
      const gameName = `Test Game ${faker.string.alphanumeric(6)}`;

      // WHEN: Creating game with pack_value not divisible by price
      const response = await storeManagerApiRequest.post("/api/lottery/games", {
        data: {
          game_code: gameCode,
          name: gameName,
          price: 7, // $7 per ticket
          pack_value: 300, // $300 / $7 = 42.857... (not a whole number)
          store_id: storeManagerUser.store_id,
        },
      });

      // THEN: Request is rejected with 400
      expect(
        response.status(),
        "Expected 400 for non-divisible pack_value",
      ).toBe(400);
      const body = await response.json();
      expect(body.success, "Response should indicate failure").toBe(false);
      expect(body.error.code, "Error code should be VALIDATION_ERROR").toBe(
        "VALIDATION_ERROR",
      );
      expect(
        body.error.message,
        "Error message should mention divisibility",
      ).toContain("evenly divisible");
    });
  });

  test.describe("POST /api/lottery/games - Store-Scoped Game Creation (RLS)", () => {
    test("6.1-API-004: [P0] CLIENT_OWNER should create store-scoped games for their company stores (AC #3)", async ({
      clientUserApiRequest,
      clientUser,
      prismaClient,
    }) => {
      // GIVEN: CLIENT_OWNER user with COMPANY scope
      const gameCode = faker.string.numeric({ length: 4, exclude: ["0000"] });
      const gameName = `Client Game ${faker.string.alphanumeric(6)}`;

      // WHEN: Creating game for user's store
      const response = await clientUserApiRequest.post("/api/lottery/games", {
        data: {
          game_code: gameCode,
          name: gameName,
          price: 5,
          pack_value: 250,
          store_id: clientUser.store_id,
        },
      });

      // THEN: Game is created successfully with store_id set
      expect(response.status(), "Expected 201 Created").toBe(201);
      const body = await response.json();
      expect(body.success, "Response should indicate success").toBe(true);
      expect(body.data.is_global, "Game should not be global").toBe(false);

      // Verify database has store_id set
      const dbGame = await prismaClient.lotteryGame.findUnique({
        where: { game_id: body.data.game_id },
      });
      expect(dbGame!.store_id, "Game should be scoped to store").toBe(
        clientUser.store_id,
      );
      expect(
        dbGame!.tickets_per_pack,
        "tickets_per_pack should be stored",
      ).toBe(50); // 250/5=50

      // Cleanup
      await prismaClient.lotteryGame.delete({
        where: { game_id: body.data.game_id },
      });
    });

    test("6.1-API-005: [P0] CLIENT_OWNER should not create games for stores outside their company (AC #4)", async ({
      clientUserApiRequest,
      prismaClient,
    }) => {
      // GIVEN: A store belonging to a different company
      // First create an owner user for the company
      const ownerUserData = createUser();
      const ownerUser = await prismaClient.user.create({ data: ownerUserData });

      const companyData = createCompany({
        name: `Test Other Company ${faker.string.alphanumeric(6)}`,
        owner_user_id: ownerUser.user_id,
      });
      const otherCompany = await prismaClient.company.create({
        data: companyData,
      });

      const storeData = createStore({
        company_id: otherCompany.company_id,
        name: `Test Other Store ${faker.string.alphanumeric(6)}`,
      });
      const otherStore = await prismaClient.store.create({
        data: {
          ...storeData,
          location_json: storeData.location_json as any,
        },
      });

      const gameCode = faker.string.numeric({ length: 4, exclude: ["0000"] });
      const gameName = `Test Game ${faker.string.alphanumeric(6)}`;

      try {
        // WHEN: Attempting to create game for store in different company
        const response = await clientUserApiRequest.post("/api/lottery/games", {
          data: {
            game_code: gameCode,
            name: gameName,
            price: 5,
            pack_value: 250,
            store_id: otherStore.store_id,
          },
        });

        // THEN: Request is rejected with 403 Forbidden
        expect(
          response.status(),
          "Expected 403 for unauthorized store access",
        ).toBe(403);
        const body = await response.json();
        expect(body.success, "Response should indicate failure").toBe(false);
      } finally {
        // Cleanup
        await prismaClient.store.delete({
          where: { store_id: otherStore.store_id },
        });
        await prismaClient.company.delete({
          where: { company_id: otherCompany.company_id },
        });
        await prismaClient.user.delete({
          where: { user_id: ownerUser.user_id },
        });
      }
    });
  });

  test.describe("POST /api/lottery/games - Validation", () => {
    test("6.1-API-006: [P1] should reject game creation with invalid game_code format (AC #5)", async ({
      storeManagerApiRequest,
      storeManagerUser,
    }) => {
      // GIVEN: Invalid game_code (not 4 digits)
      const testCases = [
        { gameCode: "123", expectedError: "4 digits" }, // Too short
        { gameCode: "12345", expectedError: "4 digits" }, // Too long
        { gameCode: "ABCD", expectedError: "4 digits" }, // Letters
        { gameCode: "12AB", expectedError: "4 digits" }, // Mixed
      ];

      for (const testCase of testCases) {
        // WHEN: Creating game with invalid game_code
        const response = await storeManagerApiRequest.post(
          "/api/lottery/games",
          {
            data: {
              game_code: testCase.gameCode,
              name: `Test Game ${faker.string.alphanumeric(6)}`,
              price: 2,
              pack_value: 300,
              store_id: storeManagerUser.store_id,
            },
          },
        );

        // THEN: Request is rejected with 400
        expect(
          response.status(),
          `Expected 400 for game_code="${testCase.gameCode}"`,
        ).toBe(400);
        const body = await response.json();
        expect(body.error.code, "Error code should be VALIDATION_ERROR").toBe(
          "VALIDATION_ERROR",
        );
      }
    });

    test("6.1-API-007: [P1] should reject game creation with zero or negative price (AC #6)", async ({
      storeManagerApiRequest,
      storeManagerUser,
    }) => {
      const gameCode = faker.string.numeric({ length: 4, exclude: ["0000"] });

      // WHEN: Creating game with zero price
      const response = await storeManagerApiRequest.post("/api/lottery/games", {
        data: {
          game_code: gameCode,
          name: `Test Game ${faker.string.alphanumeric(6)}`,
          price: 0,
          pack_value: 300,
          store_id: storeManagerUser.store_id,
        },
      });

      // THEN: Request is rejected with 400
      expect(response.status(), "Expected 400 for zero price").toBe(400);
      const body = await response.json();
      expect(body.error.message, "Error should mention price").toContain(
        "price",
      );
    });

    test("6.1-API-008: [P1] should reject game creation with zero or negative pack_value (AC #7)", async ({
      storeManagerApiRequest,
      storeManagerUser,
    }) => {
      const gameCode = faker.string.numeric({ length: 4, exclude: ["0000"] });

      // WHEN: Creating game with zero pack_value
      const response = await storeManagerApiRequest.post("/api/lottery/games", {
        data: {
          game_code: gameCode,
          name: `Test Game ${faker.string.alphanumeric(6)}`,
          price: 2,
          pack_value: 0,
          store_id: storeManagerUser.store_id,
        },
      });

      // THEN: Request is rejected with 400
      expect(response.status(), "Expected 400 for zero pack_value").toBe(400);
      const body = await response.json();
      expect(body.error.message, "Error should mention pack value").toContain(
        "Pack value",
      );
    });

    test("6.1-API-009: [P1] should reject duplicate game_code within same store scope (AC #8)", async ({
      storeManagerApiRequest,
      storeManagerUser,
      prismaClient,
    }) => {
      // GIVEN: An existing game with a specific game_code in the store
      const gameCode = faker.string.numeric({ length: 4, exclude: ["0000"] });
      const existingGame = await prismaClient.lotteryGame.create({
        data: {
          game_code: gameCode,
          name: `Existing Game ${faker.string.alphanumeric(6)}`,
          price: 2,
          pack_value: 300,
          status: "ACTIVE",
          store_id: storeManagerUser.store_id,
        },
      });

      try {
        // WHEN: Creating another game with same game_code in same store
        const response = await storeManagerApiRequest.post(
          "/api/lottery/games",
          {
            data: {
              game_code: gameCode,
              name: `Duplicate Game ${faker.string.alphanumeric(6)}`,
              price: 5,
              pack_value: 250,
              store_id: storeManagerUser.store_id,
            },
          },
        );

        // THEN: Request is rejected with 409 Conflict
        expect(response.status(), "Expected 409 for duplicate game_code").toBe(
          409,
        );
        const body = await response.json();
        expect(
          body.error.code,
          "Error code should be DUPLICATE_GAME_CODE",
        ).toBe("DUPLICATE_GAME_CODE");
      } finally {
        // Cleanup
        await prismaClient.lotteryGame.delete({
          where: { game_id: existingGame.game_id },
        });
      }
    });
  });

  test.describe("POST /api/lottery/games - Authentication", () => {
    test("6.1-API-010: [P0] should reject unauthenticated requests (AC #9)", async ({
      request,
    }) => {
      // GIVEN: Unauthenticated request (no auth token)
      const gameCode = faker.string.numeric({ length: 4, exclude: ["0000"] });

      // WHEN: Creating game without authentication
      const response = await request.post("/api/lottery/games", {
        data: {
          game_code: gameCode,
          name: `Test Game ${faker.string.alphanumeric(6)}`,
          price: 2,
          pack_value: 300,
          store_id: faker.string.uuid(),
        },
      });

      // THEN: Request is rejected with 401 Unauthorized
      expect(
        response.status(),
        "Expected 401 for unauthenticated request",
      ).toBe(401);
    });
  });
});
