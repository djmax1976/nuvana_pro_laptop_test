/**
 * Lottery Game Import API Integration Tests
 *
 * Tests for bulk lottery game import via CSV with two-phase commit pattern.
 *
 * @test-level API
 * @justification Tests API endpoints with authentication, authorization, database operations, and business logic
 * @enterprise-standards
 * - TEST-001: INTEGRATION_TESTING - End-to-end API testing
 * - SEC-014: INPUT_VALIDATION - Validation edge cases
 * - RLS: Row-level security enforcement
 */

import { test, expect } from "../support/fixtures/rbac.fixture";
import { faker } from "@faker-js/faker";

// ============================================================================
// Test Data
// ============================================================================

const VALID_CSV_CONTENT = `game_code,name,price,description,pack_value,tickets_per_pack,status
1234,Test Game One,5.00,A test game,300.00,60,ACTIVE
5678,Test Game Two,2.00,Another test game,300.00,150,ACTIVE
9012,Test Game Three,10.00,,500.00,50,INACTIVE`;

const INVALID_CSV_CONTENT = `game_code,name,price,description,pack_value,tickets_per_pack,status
abc,Invalid Code,5.00,Bad game code,,60,ACTIVE
1234,,5.00,Missing name,300.00,60,ACTIVE
1234,Valid Name,-5.00,Negative price,300.00,60,ACTIVE`;

const DUPLICATE_CSV_CONTENT = `game_code,name,price,description,pack_value,tickets_per_pack,status
1234,Duplicate Test,5.00,First occurrence,300.00,60,ACTIVE
1234,Duplicate Test,5.00,Second occurrence,300.00,60,ACTIVE`;

// ============================================================================
// Tests
// ============================================================================

test.describe("Lottery Game Import API", () => {
  test.describe("POST /api/lottery/games/import/validate", () => {
    test("should validate a valid CSV file and return preview", async ({
      superadminApiRequest,
      prismaClient,
      request,
      backendUrl,
      superadminUser,
    }) => {
      // Get a lottery-enabled state
      const state = await prismaClient.uSState.findFirst({
        where: { lottery_enabled: true, is_active: true },
      });

      if (!state) {
        test.skip(true, "No lottery-enabled state available");
        return;
      }

      // Generate unique game codes for this test
      const code1 = faker.string.numeric({ length: 4, exclude: ["0"] });
      const code2 = faker.string.numeric({ length: 4, exclude: ["0"] });
      const code3 = faker.string.numeric({ length: 4, exclude: ["0"] });
      const testCsv = `game_code,name,price,description,pack_value,tickets_per_pack,status
${code1},Import Test One,5.00,A test game,300.00,60,ACTIVE
${code2},Import Test Two,2.00,Another test game,300.00,150,ACTIVE
${code3},Import Test Three,10.00,,500.00,50,INACTIVE`;

      // Use raw request for multipart upload
      const response = await request.post(
        `${backendUrl}/api/lottery/games/import/validate?state_id=${state.state_id}`,
        {
          headers: {
            Cookie: `access_token=${superadminUser.token}`,
          },
          multipart: {
            file: {
              name: "games.csv",
              mimeType: "text/csv",
              buffer: Buffer.from(testCsv),
            },
          },
        },
      );

      expect(response.status()).toBe(200);
      const body = await response.json();

      expect(body.success).toBe(true);
      expect(body.data).toBeDefined();
      expect(body.data.valid).toBe(true);
      expect(body.data.preview).toMatchObject({
        total_rows: 3,
        valid_rows: 3,
        error_rows: 0,
        duplicate_rows: 0,
        games_to_create: 3,
        games_to_update: 0,
      });
      expect(body.data.validation_token).toBeDefined();
      expect(body.data.expires_at).toBeDefined();
      expect(body.data.rows).toHaveLength(3);

      // Cleanup: delete the validation record
      if (body.data.validation_token) {
        await prismaClient.lotteryGameImport.deleteMany({
          where: { validation_token: body.data.validation_token },
        });
      }
    });

    test("should detect validation errors in CSV", async ({
      prismaClient,
      request,
      backendUrl,
      superadminUser,
    }) => {
      const state = await prismaClient.uSState.findFirst({
        where: { lottery_enabled: true, is_active: true },
      });

      if (!state) {
        test.skip(true, "No lottery-enabled state available");
        return;
      }

      const response = await request.post(
        `${backendUrl}/api/lottery/games/import/validate?state_id=${state.state_id}`,
        {
          headers: {
            Cookie: `access_token=${superadminUser.token}`,
          },
          multipart: {
            file: {
              name: "invalid.csv",
              mimeType: "text/csv",
              buffer: Buffer.from(INVALID_CSV_CONTENT),
            },
          },
        },
      );

      expect(response.status()).toBe(400);
      const body = await response.json();

      expect(body.data?.valid).toBe(false);
      expect(body.data?.preview?.error_rows).toBeGreaterThan(0);

      // Check that error rows have error messages
      const errorRows =
        body.data?.rows?.filter((r: any) => r.status === "error") || [];
      expect(errorRows.length).toBeGreaterThan(0);
      errorRows.forEach((row: any) => {
        expect(row.errors).toBeDefined();
        expect(row.errors.length).toBeGreaterThan(0);
      });
    });

    test("should detect internal duplicates within CSV", async ({
      prismaClient,
      request,
      backendUrl,
      superadminUser,
    }) => {
      const state = await prismaClient.uSState.findFirst({
        where: { lottery_enabled: true, is_active: true },
      });

      if (!state) {
        test.skip(true, "No lottery-enabled state available");
        return;
      }

      const response = await request.post(
        `${backendUrl}/api/lottery/games/import/validate?state_id=${state.state_id}`,
        {
          headers: {
            Cookie: `access_token=${superadminUser.token}`,
          },
          multipart: {
            file: {
              name: "duplicates.csv",
              mimeType: "text/csv",
              buffer: Buffer.from(DUPLICATE_CSV_CONTENT),
            },
          },
        },
      );

      expect(response.status()).toBe(400);
      const body = await response.json();

      // Second row should be marked as error due to duplicate game_code
      expect(body.data?.preview?.error_rows).toBeGreaterThan(0);
    });

    test("should require state_id parameter", async ({
      request,
      backendUrl,
      superadminUser,
    }) => {
      const response = await request.post(
        `${backendUrl}/api/lottery/games/import/validate`,
        {
          headers: {
            Cookie: `access_token=${superadminUser.token}`,
          },
          multipart: {
            file: {
              name: "games.csv",
              mimeType: "text/csv",
              buffer: Buffer.from(VALID_CSV_CONTENT),
            },
          },
        },
      );

      expect(response.status()).toBe(400);
      const body = await response.json();
      expect(body.error?.code).toBe("VALIDATION_ERROR");
    });

    test("should require file upload", async ({
      prismaClient,
      request,
      backendUrl,
      superadminUser,
    }) => {
      const state = await prismaClient.uSState.findFirst({
        where: { lottery_enabled: true, is_active: true },
      });

      if (!state) {
        test.skip(true, "No lottery-enabled state available");
        return;
      }

      const response = await request.post(
        `${backendUrl}/api/lottery/games/import/validate?state_id=${state.state_id}`,
        {
          headers: {
            Cookie: `access_token=${superadminUser.token}`,
          },
        },
      );

      expect(response.status()).toBe(400);
      const body = await response.json();
      expect(body.error?.code).toBe("FILE_REQUIRED");
    });

    test("should reject non-CSV files", async ({
      prismaClient,
      request,
      backendUrl,
      superadminUser,
    }) => {
      const state = await prismaClient.uSState.findFirst({
        where: { lottery_enabled: true, is_active: true },
      });

      if (!state) {
        test.skip(true, "No lottery-enabled state available");
        return;
      }

      const response = await request.post(
        `${backendUrl}/api/lottery/games/import/validate?state_id=${state.state_id}`,
        {
          headers: {
            Cookie: `access_token=${superadminUser.token}`,
          },
          multipart: {
            file: {
              name: "test.json",
              mimeType: "application/json",
              buffer: Buffer.from('{"test": true}'),
            },
          },
        },
      );

      expect(response.status()).toBe(400);
      const body = await response.json();
      expect(body.error?.code).toBe("INVALID_FILE_TYPE");
    });

    test("should require LOTTERY_GAME_CREATE permission", async ({
      prismaClient,
      request,
      backendUrl,
      regularUser,
    }) => {
      const state = await prismaClient.uSState.findFirst({
        where: { lottery_enabled: true, is_active: true },
      });

      if (!state) {
        test.skip(true, "No lottery-enabled state available");
        return;
      }

      // regularUser has no special permissions
      const response = await request.post(
        `${backendUrl}/api/lottery/games/import/validate?state_id=${state.state_id}`,
        {
          headers: {
            Cookie: `access_token=${regularUser.token}`,
          },
          multipart: {
            file: {
              name: "games.csv",
              mimeType: "text/csv",
              buffer: Buffer.from(VALID_CSV_CONTENT),
            },
          },
        },
      );

      expect(response.status()).toBe(403);
    });

    test("should reject invalid state_id", async ({
      request,
      backendUrl,
      superadminUser,
    }) => {
      const response = await request.post(
        `${backendUrl}/api/lottery/games/import/validate?state_id=00000000-0000-0000-0000-000000000000`,
        {
          headers: {
            Cookie: `access_token=${superadminUser.token}`,
          },
          multipart: {
            file: {
              name: "games.csv",
              mimeType: "text/csv",
              buffer: Buffer.from(VALID_CSV_CONTENT),
            },
          },
        },
      );

      expect(response.status()).toBe(400);
    });
  });

  test.describe("POST /api/lottery/games/import/commit", () => {
    test("should commit a validated import", async ({
      prismaClient,
      request,
      backendUrl,
      superadminUser,
    }) => {
      const state = await prismaClient.uSState.findFirst({
        where: { lottery_enabled: true, is_active: true },
      });

      if (!state) {
        test.skip(true, "No lottery-enabled state available");
        return;
      }

      // Generate unique game codes for this test
      const uniqueCode1 = `T${faker.string.numeric(3)}`;
      const uniqueCode2 = `U${faker.string.numeric(3)}`;
      const uniqueCsv = `game_code,name,price
${uniqueCode1},Commit Test Game 1,5.00
${uniqueCode2},Commit Test Game 2,10.00`;

      // First, validate the CSV
      const validateResponse = await request.post(
        `${backendUrl}/api/lottery/games/import/validate?state_id=${state.state_id}`,
        {
          headers: {
            Cookie: `access_token=${superadminUser.token}`,
          },
          multipart: {
            file: {
              name: "commit-test.csv",
              mimeType: "text/csv",
              buffer: Buffer.from(uniqueCsv),
            },
          },
        },
      );

      expect(validateResponse.status()).toBe(200);
      const validateBody = await validateResponse.json();
      expect(validateBody.data?.validation_token).toBeDefined();

      const validationToken = validateBody.data.validation_token;

      // Now commit the import
      const commitResponse = await request.post(
        `${backendUrl}/api/lottery/games/import/commit`,
        {
          headers: {
            Cookie: `access_token=${superadminUser.token}`,
            "Content-Type": "application/json",
          },
          data: {
            validation_token: validationToken,
            options: {
              skip_errors: true,
              update_duplicates: false,
            },
          },
        },
      );

      expect(commitResponse.status()).toBe(200);
      const commitBody = await commitResponse.json();

      expect(commitBody.success).toBe(true);
      expect(commitBody.data?.summary).toMatchObject({
        created: 2,
        updated: 0,
        skipped: 0,
        failed: 0,
      });
      expect(commitBody.data?.created_games).toHaveLength(2);

      // Cleanup: delete created games and import record
      const gameIds = commitBody.data?.created_games?.map(
        (g: any) => g.game_id,
      );
      if (gameIds?.length > 0) {
        await prismaClient.lotteryGame.deleteMany({
          where: { game_id: { in: gameIds } },
        });
      }
      await prismaClient.lotteryGameImport.deleteMany({
        where: { validation_token: validationToken },
      });
    });

    test("should reject invalid validation token", async ({
      request,
      backendUrl,
      superadminUser,
    }) => {
      const response = await request.post(
        `${backendUrl}/api/lottery/games/import/commit`,
        {
          headers: {
            Cookie: `access_token=${superadminUser.token}`,
            "Content-Type": "application/json",
          },
          data: {
            validation_token: "00000000-0000-0000-0000-000000000000",
          },
        },
      );

      expect(response.status()).toBe(404);
      const body = await response.json();
      expect(body.error?.code).toBe("TOKEN_NOT_FOUND");
    });

    test("should reject already committed token", async ({
      prismaClient,
      request,
      backendUrl,
      superadminUser,
    }) => {
      const state = await prismaClient.uSState.findFirst({
        where: { lottery_enabled: true, is_active: true },
      });

      if (!state) {
        test.skip(true, "No lottery-enabled state available");
        return;
      }

      // Generate unique game codes
      const uniqueCode = `D${faker.string.numeric(3)}`;
      const uniqueCsv = `game_code,name,price
${uniqueCode},Double Commit Test,5.00`;

      // Validate
      const validateResponse = await request.post(
        `${backendUrl}/api/lottery/games/import/validate?state_id=${state.state_id}`,
        {
          headers: {
            Cookie: `access_token=${superadminUser.token}`,
          },
          multipart: {
            file: {
              name: "double-commit.csv",
              mimeType: "text/csv",
              buffer: Buffer.from(uniqueCsv),
            },
          },
        },
      );

      const validateBody = await validateResponse.json();
      const validationToken = validateBody.data.validation_token;

      // First commit
      const firstCommitResponse = await request.post(
        `${backendUrl}/api/lottery/games/import/commit`,
        {
          headers: {
            Cookie: `access_token=${superadminUser.token}`,
            "Content-Type": "application/json",
          },
          data: { validation_token: validationToken },
        },
      );
      const firstCommitBody = await firstCommitResponse.json();

      // Second commit should fail
      const secondCommit = await request.post(
        `${backendUrl}/api/lottery/games/import/commit`,
        {
          headers: {
            Cookie: `access_token=${superadminUser.token}`,
            "Content-Type": "application/json",
          },
          data: { validation_token: validationToken },
        },
      );

      expect(secondCommit.status()).toBe(400);
      const body = await secondCommit.json();
      expect(body.error?.code).toBe("ALREADY_COMMITTED");

      // Cleanup
      const gameIds = firstCommitBody.data?.created_games?.map(
        (g: any) => g.game_id,
      );
      if (gameIds?.length > 0) {
        await prismaClient.lotteryGame.deleteMany({
          where: { game_id: { in: gameIds } },
        });
      }
      await prismaClient.lotteryGameImport.deleteMany({
        where: { validation_token: validationToken },
      });
    });
  });

  test.describe("GET /api/lottery/games/import/template", () => {
    test("should return CSV template", async ({ superadminApiRequest }) => {
      const response = await superadminApiRequest.get(
        `/api/lottery/games/import/template`,
      );

      expect(response.status()).toBe(200);
      expect(response.headers()["content-type"]).toContain("text/csv");
      expect(response.headers()["content-disposition"]).toContain("attachment");

      const content = await response.text();
      expect(content).toContain("game_code");
      expect(content).toContain("name");
      expect(content).toContain("price");
    });

    test("should require authentication", async ({ apiRequest }) => {
      const response = await apiRequest.get(
        `/api/lottery/games/import/template`,
      );
      expect(response.status()).toBe(401);
    });
  });

  test.describe("GET /api/lottery/games/import/status/:token", () => {
    test("should return import status", async ({
      prismaClient,
      request,
      backendUrl,
      superadminUser,
      superadminApiRequest,
    }) => {
      const state = await prismaClient.uSState.findFirst({
        where: { lottery_enabled: true, is_active: true },
      });

      if (!state) {
        test.skip(true, "No lottery-enabled state available");
        return;
      }

      // Create a validation to get a token
      const uniqueCode = `S${faker.string.numeric(3)}`;
      const uniqueCsv = `game_code,name,price
${uniqueCode},Status Test,5.00`;

      const validateResponse = await request.post(
        `${backendUrl}/api/lottery/games/import/validate?state_id=${state.state_id}`,
        {
          headers: {
            Cookie: `access_token=${superadminUser.token}`,
          },
          multipart: {
            file: {
              name: "status-test.csv",
              mimeType: "text/csv",
              buffer: Buffer.from(uniqueCsv),
            },
          },
        },
      );

      const validateBody = await validateResponse.json();
      const validationToken = validateBody.data.validation_token;

      // Check status
      const statusResponse = await superadminApiRequest.get(
        `/api/lottery/games/import/status/${validationToken}`,
      );

      expect(statusResponse.status()).toBe(200);
      const statusBody = await statusResponse.json();

      expect(statusBody.success).toBe(true);
      expect(statusBody.data).toMatchObject({
        validation_token: validationToken,
        total_rows: 1,
        is_committed: false,
        is_expired: false,
      });

      // Cleanup
      await prismaClient.lotteryGameImport.deleteMany({
        where: { validation_token: validationToken },
      });
    });

    test("should return 404 for unknown token", async ({
      superadminApiRequest,
    }) => {
      const response = await superadminApiRequest.get(
        `/api/lottery/games/import/status/00000000-0000-0000-0000-000000000000`,
      );

      expect(response.status()).toBe(404);
    });
  });
});
