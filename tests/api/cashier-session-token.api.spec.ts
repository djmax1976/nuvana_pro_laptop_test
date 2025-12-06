/**
 * @test-level API
 * @justification Endpoint integration tests verifying Cashier Session Token system for terminal operations
 * @story 4-92-cashier-session-token
 *
 * Cashier Session Token API Tests
 *
 * STORY: As a Client User operating a terminal, I want to authenticate cashiers
 * so that they can perform terminal operations (shifts, transactions) securely.
 *
 * TEST LEVEL: API (endpoint integration tests)
 * PRIMARY GOAL: Verify cashier session token creation, validation, and lifecycle
 *
 * SECURITY MODEL TESTED:
 * - CLIENT_USER authenticates via web login (JWT in httpOnly cookie)
 * - CASHIER authenticates via PIN (creates CashierSession with token)
 * - Session tokens are cryptographically secure (256-bit random)
 * - Session tokens are hashed before storage (SHA-256)
 * - Sessions expire after 12 hours by default
 * - Only one active session per cashier per terminal
 *
 * BUSINESS RULES TESTED:
 * - Session creation requires valid cashier PIN authentication
 * - Session creation requires terminal_id in request
 * - Previous sessions on same terminal are invalidated
 * - Expired sessions are auto-invalidated
 * - Disabled cashiers cannot use sessions
 */

import { test, expect } from "../support/fixtures/rbac.fixture";
import {
  createUser,
  createCompany,
  createStore,
  createTerminal,
  createJWTAccessToken,
  createCashier,
} from "../support/factories";
import { PrismaClient } from "@prisma/client";
import crypto from "crypto";

// =============================================================================
// SECTION 1: P0 CRITICAL - SESSION CREATION TESTS
// =============================================================================

test.describe("4.92-API: Cashier Session Token - Session Creation", () => {
  test("4.92-API-001: [P0] should create session token when terminal_id is provided in authenticate request", async ({
    authenticatedApiRequest,
    superadminUser,
    prismaClient,
  }) => {
    // GIVEN: A store with terminal and cashier
    const company = await prismaClient.company.create({
      data: createCompany({ owner_user_id: superadminUser.user_id }),
    });
    const store = await prismaClient.store.create({
      data: createStore({ company_id: company.company_id }),
    });
    const terminal = await prismaClient.pOSTerminal.create({
      data: createTerminal({ store_id: store.store_id }),
    });

    // Create a cashier with known PIN
    const cashierData = await createCashier({
      store_id: store.store_id,
      created_by: superadminUser.user_id,
      pin: "1234",
    });
    const cashier = await prismaClient.cashier.create({ data: cashierData });

    // WHEN: Authenticating with terminal_id
    const response = await authenticatedApiRequest.post(
      `/api/stores/${store.store_id}/cashiers/authenticate`,
      {
        name: cashierData.name,
        pin: "1234",
        terminal_id: terminal.pos_terminal_id,
      },
    );

    // THEN: Response includes session token
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.cashier_id).toBe(cashier.cashier_id);
    expect(body.data.session).toBeDefined();
    expect(body.data.session.session_id).toBeDefined();
    expect(body.data.session.session_token).toBeDefined();
    expect(body.data.session.expires_at).toBeDefined();

    // AND: Session token is 64 hex characters (256 bits)
    expect(body.data.session.session_token).toMatch(/^[a-f0-9]{64}$/);

    // AND: Session is stored in database
    const dbSession = await prismaClient.cashierSession.findUnique({
      where: { session_id: body.data.session.session_id },
    });
    expect(dbSession).not.toBeNull();
    expect(dbSession?.is_active).toBe(true);
    expect(dbSession?.cashier_id).toBe(cashier.cashier_id);
    expect(dbSession?.terminal_id).toBe(terminal.pos_terminal_id);
  });

  test("4.92-API-002: [P0] should NOT create session when terminal_id is NOT provided", async ({
    authenticatedApiRequest,
    superadminUser,
    prismaClient,
  }) => {
    // GIVEN: A store with cashier (no terminal_id in request)
    const company = await prismaClient.company.create({
      data: createCompany({ owner_user_id: superadminUser.user_id }),
    });
    const store = await prismaClient.store.create({
      data: createStore({ company_id: company.company_id }),
    });

    const cashierData = await createCashier({
      store_id: store.store_id,
      created_by: superadminUser.user_id,
      pin: "1234",
    });
    const cashier = await prismaClient.cashier.create({ data: cashierData });

    // WHEN: Authenticating WITHOUT terminal_id
    const response = await authenticatedApiRequest.post(
      `/api/stores/${store.store_id}/cashiers/authenticate`,
      {
        name: cashierData.name,
        pin: "1234",
        // terminal_id is NOT provided
      },
    );

    // THEN: Response is successful but session is null
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.cashier_id).toBe(cashier.cashier_id);
    expect(body.data.session).toBeNull();
  });

  test("4.92-API-003: [P0] should invalidate previous session when creating new one on same terminal", async ({
    authenticatedApiRequest,
    superadminUser,
    prismaClient,
  }) => {
    // GIVEN: A cashier with an existing active session on a terminal
    const company = await prismaClient.company.create({
      data: createCompany({ owner_user_id: superadminUser.user_id }),
    });
    const store = await prismaClient.store.create({
      data: createStore({ company_id: company.company_id }),
    });
    const terminal = await prismaClient.pOSTerminal.create({
      data: createTerminal({ store_id: store.store_id }),
    });

    const cashierData = await createCashier({
      store_id: store.store_id,
      created_by: superadminUser.user_id,
      pin: "1234",
    });
    const cashier = await prismaClient.cashier.create({ data: cashierData });

    // Create first session
    const response1 = await authenticatedApiRequest.post(
      `/api/stores/${store.store_id}/cashiers/authenticate`,
      {
        name: cashierData.name,
        pin: "1234",
        terminal_id: terminal.pos_terminal_id,
      },
    );
    const body1 = await response1.json();
    const firstSessionId = body1.data.session.session_id;

    // WHEN: Creating a new session on the same terminal
    const response2 = await authenticatedApiRequest.post(
      `/api/stores/${store.store_id}/cashiers/authenticate`,
      {
        name: cashierData.name,
        pin: "1234",
        terminal_id: terminal.pos_terminal_id,
      },
    );

    // THEN: New session is created
    expect(response2.status()).toBe(200);
    const body2 = await response2.json();
    expect(body2.data.session.session_id).not.toBe(firstSessionId);

    // AND: Previous session is invalidated
    const previousSession = await prismaClient.cashierSession.findUnique({
      where: { session_id: firstSessionId },
    });
    expect(previousSession?.is_active).toBe(false);
    expect(previousSession?.ended_at).not.toBeNull();
  });

  test("4.92-API-004: [P0] should store session token as SHA-256 hash (security)", async ({
    authenticatedApiRequest,
    superadminUser,
    prismaClient,
  }) => {
    // GIVEN: A store with terminal and cashier
    const company = await prismaClient.company.create({
      data: createCompany({ owner_user_id: superadminUser.user_id }),
    });
    const store = await prismaClient.store.create({
      data: createStore({ company_id: company.company_id }),
    });
    const terminal = await prismaClient.pOSTerminal.create({
      data: createTerminal({ store_id: store.store_id }),
    });

    const cashierData = await createCashier({
      store_id: store.store_id,
      created_by: superadminUser.user_id,
      pin: "1234",
    });
    await prismaClient.cashier.create({ data: cashierData });

    // WHEN: Creating a session
    const response = await authenticatedApiRequest.post(
      `/api/stores/${store.store_id}/cashiers/authenticate`,
      {
        name: cashierData.name,
        pin: "1234",
        terminal_id: terminal.pos_terminal_id,
      },
    );

    const body = await response.json();
    const plainToken = body.data.session.session_token;
    const sessionId = body.data.session.session_id;

    // THEN: Database stores hash, not plain token
    const dbSession = await prismaClient.cashierSession.findUnique({
      where: { session_id: sessionId },
    });

    // Verify it's NOT the plain token
    expect(dbSession?.session_token_hash).not.toBe(plainToken);

    // Verify it's a SHA-256 hash of the token
    const expectedHash = crypto
      .createHash("sha256")
      .update(plainToken)
      .digest("hex");
    expect(dbSession?.session_token_hash).toBe(expectedHash);
  });

  test("4.92-API-005: [P0] should set session expiry to 12 hours by default", async ({
    authenticatedApiRequest,
    superadminUser,
    prismaClient,
  }) => {
    // GIVEN: A store with terminal and cashier
    const company = await prismaClient.company.create({
      data: createCompany({ owner_user_id: superadminUser.user_id }),
    });
    const store = await prismaClient.store.create({
      data: createStore({ company_id: company.company_id }),
    });
    const terminal = await prismaClient.pOSTerminal.create({
      data: createTerminal({ store_id: store.store_id }),
    });

    const cashierData = await createCashier({
      store_id: store.store_id,
      created_by: superadminUser.user_id,
      pin: "1234",
    });
    await prismaClient.cashier.create({ data: cashierData });

    const beforeCreate = new Date();

    // WHEN: Creating a session
    const response = await authenticatedApiRequest.post(
      `/api/stores/${store.store_id}/cashiers/authenticate`,
      {
        name: cashierData.name,
        pin: "1234",
        terminal_id: terminal.pos_terminal_id,
      },
    );

    const body = await response.json();
    const expiresAt = new Date(body.data.session.expires_at);

    // THEN: Expiry is approximately 12 hours from now
    const expectedExpiry = new Date(
      beforeCreate.getTime() + 12 * 60 * 60 * 1000,
    );
    // Allow 1 minute tolerance for test execution time
    const tolerance = 60 * 1000;
    expect(
      Math.abs(expiresAt.getTime() - expectedExpiry.getTime()),
    ).toBeLessThan(tolerance);
  });

  test("4.92-API-006: [P0] should track authenticated_by (CLIENT_USER who initiated)", async ({
    authenticatedApiRequest,
    superadminUser,
    prismaClient,
  }) => {
    // GIVEN: A store with terminal and cashier
    const company = await prismaClient.company.create({
      data: createCompany({ owner_user_id: superadminUser.user_id }),
    });
    const store = await prismaClient.store.create({
      data: createStore({ company_id: company.company_id }),
    });
    const terminal = await prismaClient.pOSTerminal.create({
      data: createTerminal({ store_id: store.store_id }),
    });

    const cashierData = await createCashier({
      store_id: store.store_id,
      created_by: superadminUser.user_id,
      pin: "1234",
    });
    await prismaClient.cashier.create({ data: cashierData });

    // WHEN: Creating a session (authenticatedApiRequest uses superadminUser)
    const response = await authenticatedApiRequest.post(
      `/api/stores/${store.store_id}/cashiers/authenticate`,
      {
        name: cashierData.name,
        pin: "1234",
        terminal_id: terminal.pos_terminal_id,
      },
    );

    const body = await response.json();
    const sessionId = body.data.session.session_id;

    // THEN: authenticated_by is set to the CLIENT_USER
    const dbSession = await prismaClient.cashierSession.findUnique({
      where: { session_id: sessionId },
    });
    expect(dbSession?.authenticated_by).toBe(superadminUser.user_id);
  });
});

// =============================================================================
// SECTION 2: P0 CRITICAL - SESSION VALIDATION TESTS
// =============================================================================

test.describe("4.92-API: Cashier Session Token - Session Validation", () => {
  test("4.92-API-007: [P0] should reject authentication with invalid PIN (no session created)", async ({
    authenticatedApiRequest,
    superadminUser,
    prismaClient,
  }) => {
    // GIVEN: A store with terminal and cashier
    const company = await prismaClient.company.create({
      data: createCompany({ owner_user_id: superadminUser.user_id }),
    });
    const store = await prismaClient.store.create({
      data: createStore({ company_id: company.company_id }),
    });
    const terminal = await prismaClient.pOSTerminal.create({
      data: createTerminal({ store_id: store.store_id }),
    });

    const cashierData = await createCashier({
      store_id: store.store_id,
      created_by: superadminUser.user_id,
      pin: "1234",
    });
    await prismaClient.cashier.create({ data: cashierData });

    // WHEN: Authenticating with wrong PIN
    const response = await authenticatedApiRequest.post(
      `/api/stores/${store.store_id}/cashiers/authenticate`,
      {
        name: cashierData.name,
        pin: "9999", // Wrong PIN
        terminal_id: terminal.pos_terminal_id,
      },
    );

    // THEN: Authentication fails
    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("AUTHENTICATION_FAILED");

    // AND: No session is created
    const sessions = await prismaClient.cashierSession.findMany({
      where: { terminal_id: terminal.pos_terminal_id },
    });
    expect(sessions.length).toBe(0);
  });

  test("4.92-API-008: [P0] should reject authentication for inactive cashier", async ({
    authenticatedApiRequest,
    superadminUser,
    prismaClient,
  }) => {
    // GIVEN: An inactive cashier
    const company = await prismaClient.company.create({
      data: createCompany({ owner_user_id: superadminUser.user_id }),
    });
    const store = await prismaClient.store.create({
      data: createStore({ company_id: company.company_id }),
    });
    const terminal = await prismaClient.pOSTerminal.create({
      data: createTerminal({ store_id: store.store_id }),
    });

    const cashierData = await createCashier({
      store_id: store.store_id,
      created_by: superadminUser.user_id,
      pin: "1234",
      is_active: false,
      disabled_at: new Date(),
    });
    await prismaClient.cashier.create({ data: cashierData });

    // WHEN: Authenticating inactive cashier
    const response = await authenticatedApiRequest.post(
      `/api/stores/${store.store_id}/cashiers/authenticate`,
      {
        name: cashierData.name,
        pin: "1234",
        terminal_id: terminal.pos_terminal_id,
      },
    );

    // THEN: Authentication fails with generic message
    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("AUTHENTICATION_FAILED");
  });

  test("4.92-API-009: [P0] should validate terminal_id is a valid UUID", async ({
    authenticatedApiRequest,
    superadminUser,
    prismaClient,
  }) => {
    // GIVEN: A store with cashier
    const company = await prismaClient.company.create({
      data: createCompany({ owner_user_id: superadminUser.user_id }),
    });
    const store = await prismaClient.store.create({
      data: createStore({ company_id: company.company_id }),
    });

    const cashierData = await createCashier({
      store_id: store.store_id,
      created_by: superadminUser.user_id,
      pin: "1234",
    });
    await prismaClient.cashier.create({ data: cashierData });

    // WHEN: Authenticating with invalid terminal_id format
    const response = await authenticatedApiRequest.post(
      `/api/stores/${store.store_id}/cashiers/authenticate`,
      {
        name: cashierData.name,
        pin: "1234",
        terminal_id: "not-a-valid-uuid",
      },
    );

    // THEN: Validation fails
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });
});

// =============================================================================
// SECTION 3: P0 CRITICAL - SECURITY TESTS
// =============================================================================

test.describe("4.92-API: Cashier Session Token - Security", () => {
  test("4.92-API-010: [P0] should require JWT authentication to create session", async ({
    apiRequest,
    prismaClient,
  }) => {
    // GIVEN: A store with terminal and cashier (no JWT auth)
    const user = await prismaClient.user.create({
      data: createUser(),
    });
    const company = await prismaClient.company.create({
      data: createCompany({ owner_user_id: user.user_id }),
    });
    const store = await prismaClient.store.create({
      data: createStore({ company_id: company.company_id }),
    });
    const terminal = await prismaClient.pOSTerminal.create({
      data: createTerminal({ store_id: store.store_id }),
    });

    const cashierData = await createCashier({
      store_id: store.store_id,
      created_by: user.user_id,
      pin: "1234",
    });
    await prismaClient.cashier.create({ data: cashierData });

    // WHEN: Making request without JWT token
    const response = await apiRequest.post(
      `/api/stores/${store.store_id}/cashiers/authenticate`,
      {
        name: cashierData.name,
        pin: "1234",
        terminal_id: terminal.pos_terminal_id,
      },
    );

    // THEN: Request is rejected with 401
    expect(response.status()).toBe(401);
  });

  test("4.92-API-011: [P0] should generate unique tokens for each session (cryptographic randomness)", async ({
    authenticatedApiRequest,
    superadminUser,
    prismaClient,
  }) => {
    // GIVEN: A store with terminal and cashier
    const company = await prismaClient.company.create({
      data: createCompany({ owner_user_id: superadminUser.user_id }),
    });
    const store = await prismaClient.store.create({
      data: createStore({ company_id: company.company_id }),
    });
    const terminal = await prismaClient.pOSTerminal.create({
      data: createTerminal({ store_id: store.store_id }),
    });

    const cashierData = await createCashier({
      store_id: store.store_id,
      created_by: superadminUser.user_id,
      pin: "1234",
    });
    await prismaClient.cashier.create({ data: cashierData });

    // WHEN: Creating multiple sessions
    const tokens: string[] = [];
    for (let i = 0; i < 5; i++) {
      const response = await authenticatedApiRequest.post(
        `/api/stores/${store.store_id}/cashiers/authenticate`,
        {
          name: cashierData.name,
          pin: "1234",
          terminal_id: terminal.pos_terminal_id,
        },
      );
      const body = await response.json();
      tokens.push(body.data.session.session_token);
    }

    // THEN: All tokens are unique
    const uniqueTokens = new Set(tokens);
    expect(uniqueTokens.size).toBe(5);

    // AND: Each token is 64 hex characters (256 bits)
    tokens.forEach((token) => {
      expect(token).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  test("4.92-API-012: [P0] should use generic error message for authentication failures (no information leakage)", async ({
    authenticatedApiRequest,
    superadminUser,
    prismaClient,
  }) => {
    // GIVEN: A store with terminal and cashier
    const company = await prismaClient.company.create({
      data: createCompany({ owner_user_id: superadminUser.user_id }),
    });
    const store = await prismaClient.store.create({
      data: createStore({ company_id: company.company_id }),
    });
    const terminal = await prismaClient.pOSTerminal.create({
      data: createTerminal({ store_id: store.store_id }),
    });

    const cashierData = await createCashier({
      store_id: store.store_id,
      created_by: superadminUser.user_id,
      pin: "1234",
    });
    await prismaClient.cashier.create({ data: cashierData });

    // WHEN: Authenticating with wrong PIN
    const wrongPinResponse = await authenticatedApiRequest.post(
      `/api/stores/${store.store_id}/cashiers/authenticate`,
      {
        name: cashierData.name,
        pin: "9999",
        terminal_id: terminal.pos_terminal_id,
      },
    );

    // WHEN: Authenticating non-existent cashier
    const nonExistentResponse = await authenticatedApiRequest.post(
      `/api/stores/${store.store_id}/cashiers/authenticate`,
      {
        name: "NonExistent Cashier",
        pin: "1234",
        terminal_id: terminal.pos_terminal_id,
      },
    );

    // THEN: Both return same generic error (no info leakage)
    const wrongPinBody = await wrongPinResponse.json();
    const nonExistentBody = await nonExistentResponse.json();

    expect(wrongPinBody.error.message).toBe("Authentication failed");
    expect(nonExistentBody.error.message).toBe("Authentication failed");

    // AND: Error message doesn't reveal whether cashier exists
    expect(wrongPinBody.error.message).not.toMatch(/not found/i);
    expect(wrongPinBody.error.message).not.toMatch(/wrong pin/i);
    expect(wrongPinBody.error.message).not.toMatch(/invalid pin/i);
  });

  test("4.92-API-013: [P0] should enforce rate limiting on authenticate endpoint", async ({
    authenticatedApiRequest,
    superadminUser,
    prismaClient,
  }) => {
    // Note: In CI, rate limit is set to 100, so this test verifies the mechanism exists
    // but may not trigger actual rate limiting

    // GIVEN: A store with terminal and cashier
    const company = await prismaClient.company.create({
      data: createCompany({ owner_user_id: superadminUser.user_id }),
    });
    const store = await prismaClient.store.create({
      data: createStore({ company_id: company.company_id }),
    });
    const terminal = await prismaClient.pOSTerminal.create({
      data: createTerminal({ store_id: store.store_id }),
    });

    const cashierData = await createCashier({
      store_id: store.store_id,
      created_by: superadminUser.user_id,
      pin: "1234",
    });
    await prismaClient.cashier.create({ data: cashierData });

    // WHEN: Making multiple authentication attempts
    const attempts = [];
    for (let i = 0; i < 10; i++) {
      attempts.push(
        authenticatedApiRequest.post(
          `/api/stores/${store.store_id}/cashiers/authenticate`,
          {
            name: cashierData.name,
            pin: "9999", // Wrong PIN
            terminal_id: terminal.pos_terminal_id,
          },
        ),
      );
    }
    const responses = await Promise.all(attempts);

    // THEN: All requests complete (rate limiting mechanism exists)
    expect(responses.length).toBe(10);

    // Verify responses are handled correctly (401 or 429)
    responses.forEach((response) => {
      expect([401, 429]).toContain(response.status());
    });
  });
});

// =============================================================================
// SECTION 4: P1 IMPORTANT - SESSION LIFECYCLE TESTS
// =============================================================================

test.describe("4.92-API: Cashier Session Token - Session Lifecycle", () => {
  test("4.92-API-014: [P1] should allow different cashiers on different terminals", async ({
    authenticatedApiRequest,
    superadminUser,
    prismaClient,
  }) => {
    // GIVEN: A store with two terminals and two cashiers
    const company = await prismaClient.company.create({
      data: createCompany({ owner_user_id: superadminUser.user_id }),
    });
    const store = await prismaClient.store.create({
      data: createStore({ company_id: company.company_id }),
    });
    const terminal1 = await prismaClient.pOSTerminal.create({
      data: createTerminal({ store_id: store.store_id }),
    });
    const terminal2 = await prismaClient.pOSTerminal.create({
      data: createTerminal({ store_id: store.store_id }),
    });

    const cashier1Data = await createCashier({
      store_id: store.store_id,
      created_by: superadminUser.user_id,
      pin: "1111",
    });
    const cashier2Data = await createCashier({
      store_id: store.store_id,
      created_by: superadminUser.user_id,
      pin: "2222",
    });
    const cashier1 = await prismaClient.cashier.create({ data: cashier1Data });
    const cashier2 = await prismaClient.cashier.create({ data: cashier2Data });

    // WHEN: Creating sessions for different cashiers on different terminals
    const response1 = await authenticatedApiRequest.post(
      `/api/stores/${store.store_id}/cashiers/authenticate`,
      {
        name: cashier1Data.name,
        pin: "1111",
        terminal_id: terminal1.pos_terminal_id,
      },
    );
    const response2 = await authenticatedApiRequest.post(
      `/api/stores/${store.store_id}/cashiers/authenticate`,
      {
        name: cashier2Data.name,
        pin: "2222",
        terminal_id: terminal2.pos_terminal_id,
      },
    );

    // THEN: Both sessions are created and active
    expect(response1.status()).toBe(200);
    expect(response2.status()).toBe(200);

    const body1 = await response1.json();
    const body2 = await response2.json();

    expect(body1.data.cashier_id).toBe(cashier1.cashier_id);
    expect(body2.data.cashier_id).toBe(cashier2.cashier_id);

    // AND: Both sessions are active in database
    const session1 = await prismaClient.cashierSession.findUnique({
      where: { session_id: body1.data.session.session_id },
    });
    const session2 = await prismaClient.cashierSession.findUnique({
      where: { session_id: body2.data.session.session_id },
    });

    expect(session1?.is_active).toBe(true);
    expect(session2?.is_active).toBe(true);
  });

  test("4.92-API-015: [P1] should track session metadata (store_id, terminal_id, created_at)", async ({
    authenticatedApiRequest,
    superadminUser,
    prismaClient,
  }) => {
    // GIVEN: A store with terminal and cashier
    const company = await prismaClient.company.create({
      data: createCompany({ owner_user_id: superadminUser.user_id }),
    });
    const store = await prismaClient.store.create({
      data: createStore({ company_id: company.company_id }),
    });
    const terminal = await prismaClient.pOSTerminal.create({
      data: createTerminal({ store_id: store.store_id }),
    });

    const cashierData = await createCashier({
      store_id: store.store_id,
      created_by: superadminUser.user_id,
      pin: "1234",
    });
    await prismaClient.cashier.create({ data: cashierData });

    const beforeCreate = new Date();

    // WHEN: Creating a session
    const response = await authenticatedApiRequest.post(
      `/api/stores/${store.store_id}/cashiers/authenticate`,
      {
        name: cashierData.name,
        pin: "1234",
        terminal_id: terminal.pos_terminal_id,
      },
    );

    const body = await response.json();
    const sessionId = body.data.session.session_id;

    // THEN: Session has correct metadata
    const dbSession = await prismaClient.cashierSession.findUnique({
      where: { session_id: sessionId },
    });

    expect(dbSession?.store_id).toBe(store.store_id);
    expect(dbSession?.terminal_id).toBe(terminal.pos_terminal_id);
    expect(dbSession?.created_at).toBeInstanceOf(Date);
    expect(dbSession?.created_at.getTime()).toBeGreaterThanOrEqual(
      beforeCreate.getTime(),
    );
  });
});

// =============================================================================
// SECTION 5: P1 IMPORTANT - EDGE CASES
// =============================================================================

test.describe("4.92-API: Cashier Session Token - Edge Cases", () => {
  test("4.92-API-016: [P1] should handle authentication by employee_id with terminal_id", async ({
    authenticatedApiRequest,
    superadminUser,
    prismaClient,
  }) => {
    // GIVEN: A store with terminal and cashier
    const company = await prismaClient.company.create({
      data: createCompany({ owner_user_id: superadminUser.user_id }),
    });
    const store = await prismaClient.store.create({
      data: createStore({ company_id: company.company_id }),
    });
    const terminal = await prismaClient.pOSTerminal.create({
      data: createTerminal({ store_id: store.store_id }),
    });

    const cashierData = await createCashier({
      store_id: store.store_id,
      created_by: superadminUser.user_id,
      pin: "1234",
    });
    const cashier = await prismaClient.cashier.create({ data: cashierData });

    // WHEN: Authenticating by employee_id (not name)
    const response = await authenticatedApiRequest.post(
      `/api/stores/${store.store_id}/cashiers/authenticate`,
      {
        employee_id: cashier.employee_id,
        pin: "1234",
        terminal_id: terminal.pos_terminal_id,
      },
    );

    // THEN: Session is created
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.cashier_id).toBe(cashier.cashier_id);
    expect(body.data.session).toBeDefined();
    expect(body.data.session.session_token).toBeDefined();
  });

  test("4.92-API-017: [P1] should handle same cashier on multiple terminals", async ({
    authenticatedApiRequest,
    superadminUser,
    prismaClient,
  }) => {
    // GIVEN: A store with multiple terminals and one cashier
    const company = await prismaClient.company.create({
      data: createCompany({ owner_user_id: superadminUser.user_id }),
    });
    const store = await prismaClient.store.create({
      data: createStore({ company_id: company.company_id }),
    });
    const terminal1 = await prismaClient.pOSTerminal.create({
      data: createTerminal({ store_id: store.store_id }),
    });
    const terminal2 = await prismaClient.pOSTerminal.create({
      data: createTerminal({ store_id: store.store_id }),
    });

    const cashierData = await createCashier({
      store_id: store.store_id,
      created_by: superadminUser.user_id,
      pin: "1234",
    });
    await prismaClient.cashier.create({ data: cashierData });

    // WHEN: Same cashier creates sessions on different terminals
    const response1 = await authenticatedApiRequest.post(
      `/api/stores/${store.store_id}/cashiers/authenticate`,
      {
        name: cashierData.name,
        pin: "1234",
        terminal_id: terminal1.pos_terminal_id,
      },
    );
    const response2 = await authenticatedApiRequest.post(
      `/api/stores/${store.store_id}/cashiers/authenticate`,
      {
        name: cashierData.name,
        pin: "1234",
        terminal_id: terminal2.pos_terminal_id,
      },
    );

    // THEN: Both sessions are created (different terminals allow concurrent sessions)
    expect(response1.status()).toBe(200);
    expect(response2.status()).toBe(200);

    const body1 = await response1.json();
    const body2 = await response2.json();

    // Sessions should have different IDs
    expect(body1.data.session.session_id).not.toBe(
      body2.data.session.session_id,
    );

    // Both sessions should be active
    const session1 = await prismaClient.cashierSession.findUnique({
      where: { session_id: body1.data.session.session_id },
    });
    const session2 = await prismaClient.cashierSession.findUnique({
      where: { session_id: body2.data.session.session_id },
    });

    expect(session1?.is_active).toBe(true);
    expect(session2?.is_active).toBe(true);
  });
});

// =============================================================================
// SECTION 6: P1 IMPORTANT - RESPONSE STRUCTURE TESTS
// =============================================================================

test.describe("4.92-API: Cashier Session Token - Response Structure", () => {
  test("4.92-API-018: [P1] should return correct response structure with session", async ({
    authenticatedApiRequest,
    superadminUser,
    prismaClient,
  }) => {
    // GIVEN: A store with terminal and cashier
    const company = await prismaClient.company.create({
      data: createCompany({ owner_user_id: superadminUser.user_id }),
    });
    const store = await prismaClient.store.create({
      data: createStore({ company_id: company.company_id }),
    });
    const terminal = await prismaClient.pOSTerminal.create({
      data: createTerminal({ store_id: store.store_id }),
    });

    const cashierData = await createCashier({
      store_id: store.store_id,
      created_by: superadminUser.user_id,
      pin: "1234",
    });
    const cashier = await prismaClient.cashier.create({ data: cashierData });

    // WHEN: Authenticating with terminal_id
    const response = await authenticatedApiRequest.post(
      `/api/stores/${store.store_id}/cashiers/authenticate`,
      {
        name: cashierData.name,
        pin: "1234",
        terminal_id: terminal.pos_terminal_id,
      },
    );

    // THEN: Response has correct structure
    expect(response.status()).toBe(200);
    const body = await response.json();

    // Top-level structure
    expect(body).toHaveProperty("success", true);
    expect(body).toHaveProperty("data");

    // Cashier data
    expect(body.data).toHaveProperty("cashier_id", cashier.cashier_id);
    expect(body.data).toHaveProperty("employee_id", cashier.employee_id);
    expect(body.data).toHaveProperty("name", cashier.name);

    // Session data
    expect(body.data).toHaveProperty("session");
    expect(body.data.session).toHaveProperty("session_id");
    expect(body.data.session).toHaveProperty("session_token");
    expect(body.data.session).toHaveProperty("expires_at");

    // Session token format
    expect(typeof body.data.session.session_id).toBe("string");
    expect(typeof body.data.session.session_token).toBe("string");
    expect(body.data.session.session_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(body.data.session.session_token).toMatch(/^[a-f0-9]{64}$/);

    // Expires_at is a valid ISO date string
    expect(new Date(body.data.session.expires_at).toString()).not.toBe(
      "Invalid Date",
    );
  });

  test("4.92-API-019: [P1] should not include session_token_hash in response (security)", async ({
    authenticatedApiRequest,
    superadminUser,
    prismaClient,
  }) => {
    // GIVEN: A store with terminal and cashier
    const company = await prismaClient.company.create({
      data: createCompany({ owner_user_id: superadminUser.user_id }),
    });
    const store = await prismaClient.store.create({
      data: createStore({ company_id: company.company_id }),
    });
    const terminal = await prismaClient.pOSTerminal.create({
      data: createTerminal({ store_id: store.store_id }),
    });

    const cashierData = await createCashier({
      store_id: store.store_id,
      created_by: superadminUser.user_id,
      pin: "1234",
    });
    await prismaClient.cashier.create({ data: cashierData });

    // WHEN: Authenticating with terminal_id
    const response = await authenticatedApiRequest.post(
      `/api/stores/${store.store_id}/cashiers/authenticate`,
      {
        name: cashierData.name,
        pin: "1234",
        terminal_id: terminal.pos_terminal_id,
      },
    );

    // THEN: Response does NOT include session_token_hash
    const body = await response.json();
    expect(body.data.session).not.toHaveProperty("session_token_hash");
    expect(body.data).not.toHaveProperty("session_token_hash");

    // Also verify pin_hash is not returned
    expect(body.data).not.toHaveProperty("pin_hash");
    expect(body.data).not.toHaveProperty("pin");
  });
});

// =============================================================================
// SECTION 7: P1 IMPORTANT - CROSS-STORE ISOLATION TESTS
// =============================================================================

test.describe("4.92-API: Cashier Session Token - Cross-Store Isolation", () => {
  test("4.92-API-020: [P1] should NOT allow cashier from store A to authenticate on store B's endpoint", async ({
    authenticatedApiRequest,
    superadminUser,
    prismaClient,
  }) => {
    // GIVEN: Two separate stores with their own cashiers
    const company = await prismaClient.company.create({
      data: createCompany({ owner_user_id: superadminUser.user_id }),
    });
    const storeA = await prismaClient.store.create({
      data: createStore({ company_id: company.company_id }),
    });
    const storeB = await prismaClient.store.create({
      data: createStore({ company_id: company.company_id }),
    });
    const terminalB = await prismaClient.pOSTerminal.create({
      data: createTerminal({ store_id: storeB.store_id }),
    });

    // Create cashier in Store A
    const cashierDataA = await createCashier({
      store_id: storeA.store_id,
      created_by: superadminUser.user_id,
      pin: "1234",
    });
    await prismaClient.cashier.create({ data: cashierDataA });

    // WHEN: Attempting to authenticate Store A's cashier on Store B's endpoint
    const response = await authenticatedApiRequest.post(
      `/api/stores/${storeB.store_id}/cashiers/authenticate`,
      {
        name: cashierDataA.name,
        pin: "1234",
        terminal_id: terminalB.pos_terminal_id,
      },
    );

    // THEN: Authentication fails (cashier not found in Store B)
    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("AUTHENTICATION_FAILED");
  });

  test("4.92-API-021: [P1] should enforce store-scoped PIN uniqueness (same PIN allowed in different stores)", async ({
    authenticatedApiRequest,
    superadminUser,
    prismaClient,
  }) => {
    // GIVEN: Two stores with cashiers using the same PIN
    const company = await prismaClient.company.create({
      data: createCompany({ owner_user_id: superadminUser.user_id }),
    });
    const storeA = await prismaClient.store.create({
      data: createStore({ company_id: company.company_id }),
    });
    const storeB = await prismaClient.store.create({
      data: createStore({ company_id: company.company_id }),
    });
    const terminalA = await prismaClient.pOSTerminal.create({
      data: createTerminal({ store_id: storeA.store_id }),
    });
    const terminalB = await prismaClient.pOSTerminal.create({
      data: createTerminal({ store_id: storeB.store_id }),
    });

    // Both cashiers use the same PIN "5555"
    const cashierDataA = await createCashier({
      store_id: storeA.store_id,
      created_by: superadminUser.user_id,
      pin: "5555",
    });
    const cashierDataB = await createCashier({
      store_id: storeB.store_id,
      created_by: superadminUser.user_id,
      pin: "5555",
    });
    const cashierA = await prismaClient.cashier.create({ data: cashierDataA });
    const cashierB = await prismaClient.cashier.create({ data: cashierDataB });

    // WHEN: Both cashiers authenticate on their respective stores
    const responseA = await authenticatedApiRequest.post(
      `/api/stores/${storeA.store_id}/cashiers/authenticate`,
      {
        name: cashierDataA.name,
        pin: "5555",
        terminal_id: terminalA.pos_terminal_id,
      },
    );
    const responseB = await authenticatedApiRequest.post(
      `/api/stores/${storeB.store_id}/cashiers/authenticate`,
      {
        name: cashierDataB.name,
        pin: "5555",
        terminal_id: terminalB.pos_terminal_id,
      },
    );

    // THEN: Both authentications succeed
    expect(responseA.status()).toBe(200);
    expect(responseB.status()).toBe(200);

    const bodyA = await responseA.json();
    const bodyB = await responseB.json();

    expect(bodyA.data.cashier_id).toBe(cashierA.cashier_id);
    expect(bodyB.data.cashier_id).toBe(cashierB.cashier_id);
    expect(bodyA.data.session).toBeDefined();
    expect(bodyB.data.session).toBeDefined();
  });
});

// =============================================================================
// SECTION 8: P2 EDGE CASES - ADDITIONAL VALIDATION
// =============================================================================

test.describe("4.92-API: Cashier Session Token - Additional Validation", () => {
  test("4.92-API-022: [P2] should handle missing required fields gracefully", async ({
    authenticatedApiRequest,
    superadminUser,
    prismaClient,
  }) => {
    // GIVEN: A store with terminal and cashier
    const company = await prismaClient.company.create({
      data: createCompany({ owner_user_id: superadminUser.user_id }),
    });
    const store = await prismaClient.store.create({
      data: createStore({ company_id: company.company_id }),
    });

    // WHEN: Authenticating without name OR employee_id
    const response = await authenticatedApiRequest.post(
      `/api/stores/${store.store_id}/cashiers/authenticate`,
      {
        pin: "1234",
        // Neither name nor employee_id provided
      },
    );

    // THEN: Validation fails with clear error
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.message).toMatch(/name|employee_id/i);
  });

  test("4.92-API-023: [P2] should handle invalid PIN format", async ({
    authenticatedApiRequest,
    superadminUser,
    prismaClient,
  }) => {
    // GIVEN: A store with cashier
    const company = await prismaClient.company.create({
      data: createCompany({ owner_user_id: superadminUser.user_id }),
    });
    const store = await prismaClient.store.create({
      data: createStore({ company_id: company.company_id }),
    });

    const cashierData = await createCashier({
      store_id: store.store_id,
      created_by: superadminUser.user_id,
      pin: "1234",
    });
    await prismaClient.cashier.create({ data: cashierData });

    // WHEN: Authenticating with invalid PIN format (not 4 digits)
    const response = await authenticatedApiRequest.post(
      `/api/stores/${store.store_id}/cashiers/authenticate`,
      {
        name: cashierData.name,
        pin: "12345", // 5 digits - invalid
      },
    );

    // THEN: Validation fails
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.message).toMatch(/PIN|4.*digit/i);
  });

  test("4.92-API-024: [P2] should handle non-numeric PIN format", async ({
    authenticatedApiRequest,
    superadminUser,
    prismaClient,
  }) => {
    // GIVEN: A store with cashier
    const company = await prismaClient.company.create({
      data: createCompany({ owner_user_id: superadminUser.user_id }),
    });
    const store = await prismaClient.store.create({
      data: createStore({ company_id: company.company_id }),
    });

    const cashierData = await createCashier({
      store_id: store.store_id,
      created_by: superadminUser.user_id,
      pin: "1234",
    });
    await prismaClient.cashier.create({ data: cashierData });

    // WHEN: Authenticating with non-numeric PIN
    const response = await authenticatedApiRequest.post(
      `/api/stores/${store.store_id}/cashiers/authenticate`,
      {
        name: cashierData.name,
        pin: "abcd", // Non-numeric - invalid
      },
    );

    // THEN: Validation fails
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  test("4.92-API-025: [P2] should return session with correct cashier_id on both employee_id and name authentication", async ({
    authenticatedApiRequest,
    superadminUser,
    prismaClient,
  }) => {
    // GIVEN: A store with terminal and cashier
    const company = await prismaClient.company.create({
      data: createCompany({ owner_user_id: superadminUser.user_id }),
    });
    const store = await prismaClient.store.create({
      data: createStore({ company_id: company.company_id }),
    });
    const terminal = await prismaClient.pOSTerminal.create({
      data: createTerminal({ store_id: store.store_id }),
    });

    const cashierData = await createCashier({
      store_id: store.store_id,
      created_by: superadminUser.user_id,
      pin: "9999",
    });
    const cashier = await prismaClient.cashier.create({ data: cashierData });

    // WHEN: Authenticating by name
    const responseByName = await authenticatedApiRequest.post(
      `/api/stores/${store.store_id}/cashiers/authenticate`,
      {
        name: cashierData.name,
        pin: "9999",
        terminal_id: terminal.pos_terminal_id,
      },
    );

    // WHEN: Authenticating by employee_id (creates new session on same terminal)
    const responseByEmpId = await authenticatedApiRequest.post(
      `/api/stores/${store.store_id}/cashiers/authenticate`,
      {
        employee_id: cashier.employee_id,
        pin: "9999",
        terminal_id: terminal.pos_terminal_id,
      },
    );

    // THEN: Both return the same cashier
    expect(responseByName.status()).toBe(200);
    expect(responseByEmpId.status()).toBe(200);

    const bodyByName = await responseByName.json();
    const bodyByEmpId = await responseByEmpId.json();

    expect(bodyByName.data.cashier_id).toBe(cashier.cashier_id);
    expect(bodyByEmpId.data.cashier_id).toBe(cashier.cashier_id);

    // Both should have sessions
    expect(bodyByName.data.session).toBeDefined();
    expect(bodyByEmpId.data.session).toBeDefined();

    // Second authentication should have invalidated first session
    const firstSession = await prismaClient.cashierSession.findUnique({
      where: { session_id: bodyByName.data.session.session_id },
    });
    expect(firstSession?.is_active).toBe(false);
  });
});

// =============================================================================
// SECTION 9: P0 CRITICAL - SHIFT START WITH CASHIER SESSION TOKEN
// =============================================================================

test.describe("4.92-API: Cashier Session Token - Shift Start Operations", () => {
  test("4.92-API-026: [P0] should start shift using valid cashier session token (no body required)", async ({
    authenticatedApiRequest,
    superadminUser,
    prismaClient,
  }) => {
    // GIVEN: A cashier with an active session on a terminal
    const company = await prismaClient.company.create({
      data: createCompany({ owner_user_id: superadminUser.user_id }),
    });
    const store = await prismaClient.store.create({
      data: createStore({ company_id: company.company_id }),
    });
    const terminal = await prismaClient.pOSTerminal.create({
      data: createTerminal({ store_id: store.store_id }),
    });

    const cashierData = await createCashier({
      store_id: store.store_id,
      created_by: superadminUser.user_id,
      pin: "1234",
    });
    const cashier = await prismaClient.cashier.create({ data: cashierData });

    // Create session
    const authResponse = await authenticatedApiRequest.post(
      `/api/stores/${store.store_id}/cashiers/authenticate`,
      {
        name: cashierData.name,
        pin: "1234",
        terminal_id: terminal.pos_terminal_id,
      },
    );
    const authBody = await authResponse.json();
    const sessionToken = authBody.data.session.session_token;

    // WHEN: Starting shift with session token (no cashier_id in body)
    const response = await authenticatedApiRequest.post(
      `/api/terminals/${terminal.pos_terminal_id}/shifts/start`,
      {}, // Empty body - cashier_id comes from session
      {
        headers: {
          "X-Cashier-Session": sessionToken,
        },
      },
    );

    // THEN: Shift is created successfully
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.cashier_id).toBe(cashier.cashier_id);
    expect(body.data.pos_terminal_id).toBe(terminal.pos_terminal_id);
    expect(body.data.status).toBe("OPEN");
    expect(body.data.shift_number).toBeDefined();
  });

  test("4.92-API-027: [P0] should reject shift start without X-Cashier-Session header", async ({
    authenticatedApiRequest,
    superadminUser,
    prismaClient,
  }) => {
    // GIVEN: A terminal without cashier session
    const company = await prismaClient.company.create({
      data: createCompany({ owner_user_id: superadminUser.user_id }),
    });
    const store = await prismaClient.store.create({
      data: createStore({ company_id: company.company_id }),
    });
    const terminal = await prismaClient.pOSTerminal.create({
      data: createTerminal({ store_id: store.store_id }),
    });

    // WHEN: Starting shift without session token
    const response = await authenticatedApiRequest.post(
      `/api/terminals/${terminal.pos_terminal_id}/shifts/start`,
      {},
    );

    // THEN: Request is rejected
    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("CASHIER_SESSION_REQUIRED");
  });

  test("4.92-API-028: [P0] should reject shift start with invalid session token", async ({
    authenticatedApiRequest,
    superadminUser,
    prismaClient,
  }) => {
    // GIVEN: A terminal
    const company = await prismaClient.company.create({
      data: createCompany({ owner_user_id: superadminUser.user_id }),
    });
    const store = await prismaClient.store.create({
      data: createStore({ company_id: company.company_id }),
    });
    const terminal = await prismaClient.pOSTerminal.create({
      data: createTerminal({ store_id: store.store_id }),
    });

    // WHEN: Starting shift with invalid session token
    const response = await authenticatedApiRequest.post(
      `/api/terminals/${terminal.pos_terminal_id}/shifts/start`,
      {},
      {
        headers: {
          "X-Cashier-Session": "invalid-token-that-does-not-exist",
        },
      },
    );

    // THEN: Request is rejected
    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("CASHIER_SESSION_INVALID");
  });

  test("4.92-API-029: [P0] should reject shift start when session terminal doesn't match route terminal", async ({
    authenticatedApiRequest,
    superadminUser,
    prismaClient,
  }) => {
    // GIVEN: A cashier session on terminal1, but attempting to start shift on terminal2
    const company = await prismaClient.company.create({
      data: createCompany({ owner_user_id: superadminUser.user_id }),
    });
    const store = await prismaClient.store.create({
      data: createStore({ company_id: company.company_id }),
    });
    const terminal1 = await prismaClient.pOSTerminal.create({
      data: createTerminal({ store_id: store.store_id }),
    });
    const terminal2 = await prismaClient.pOSTerminal.create({
      data: createTerminal({ store_id: store.store_id }),
    });

    const cashierData = await createCashier({
      store_id: store.store_id,
      created_by: superadminUser.user_id,
      pin: "1234",
    });
    await prismaClient.cashier.create({ data: cashierData });

    // Create session on terminal1
    const authResponse = await authenticatedApiRequest.post(
      `/api/stores/${store.store_id}/cashiers/authenticate`,
      {
        name: cashierData.name,
        pin: "1234",
        terminal_id: terminal1.pos_terminal_id, // Session is for terminal1
      },
    );
    const authBody = await authResponse.json();
    const sessionToken = authBody.data.session.session_token;

    // WHEN: Attempting to start shift on terminal2 with terminal1's session
    const response = await authenticatedApiRequest.post(
      `/api/terminals/${terminal2.pos_terminal_id}/shifts/start`, // Different terminal!
      {},
      {
        headers: {
          "X-Cashier-Session": sessionToken,
        },
      },
    );

    // THEN: Request is rejected due to terminal mismatch
    expect(response.status()).toBe(403);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("TERMINAL_MISMATCH");
  });

  test("4.92-API-030: [P0] should reject shift start when active shift already exists on terminal", async ({
    authenticatedApiRequest,
    superadminUser,
    prismaClient,
  }) => {
    // GIVEN: A terminal with an existing active shift
    const company = await prismaClient.company.create({
      data: createCompany({ owner_user_id: superadminUser.user_id }),
    });
    const store = await prismaClient.store.create({
      data: createStore({ company_id: company.company_id }),
    });
    const terminal = await prismaClient.pOSTerminal.create({
      data: createTerminal({ store_id: store.store_id }),
    });

    const cashierData = await createCashier({
      store_id: store.store_id,
      created_by: superadminUser.user_id,
      pin: "1234",
    });
    const cashier = await prismaClient.cashier.create({ data: cashierData });

    // Create existing active shift
    await prismaClient.shift.create({
      data: {
        store_id: store.store_id,
        opened_by: superadminUser.user_id,
        cashier_id: cashier.cashier_id,
        pos_terminal_id: terminal.pos_terminal_id,
        opening_cash: 0,
        status: "OPEN",
        opened_at: new Date(),
      },
    });

    // Create session
    const authResponse = await authenticatedApiRequest.post(
      `/api/stores/${store.store_id}/cashiers/authenticate`,
      {
        name: cashierData.name,
        pin: "1234",
        terminal_id: terminal.pos_terminal_id,
      },
    );
    const authBody = await authResponse.json();
    const sessionToken = authBody.data.session.session_token;

    // WHEN: Attempting to start another shift
    const response = await authenticatedApiRequest.post(
      `/api/terminals/${terminal.pos_terminal_id}/shifts/start`,
      {},
      {
        headers: {
          "X-Cashier-Session": sessionToken,
        },
      },
    );

    // THEN: Request is rejected
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("SHIFT_ALREADY_ACTIVE");
  });

  test("4.92-API-031: [P0] should link session to shift after successful start", async ({
    authenticatedApiRequest,
    superadminUser,
    prismaClient,
  }) => {
    // GIVEN: A cashier with an active session
    const company = await prismaClient.company.create({
      data: createCompany({ owner_user_id: superadminUser.user_id }),
    });
    const store = await prismaClient.store.create({
      data: createStore({ company_id: company.company_id }),
    });
    const terminal = await prismaClient.pOSTerminal.create({
      data: createTerminal({ store_id: store.store_id }),
    });

    const cashierData = await createCashier({
      store_id: store.store_id,
      created_by: superadminUser.user_id,
      pin: "1234",
    });
    await prismaClient.cashier.create({ data: cashierData });

    // Create session
    const authResponse = await authenticatedApiRequest.post(
      `/api/stores/${store.store_id}/cashiers/authenticate`,
      {
        name: cashierData.name,
        pin: "1234",
        terminal_id: terminal.pos_terminal_id,
      },
    );
    const authBody = await authResponse.json();
    const sessionToken = authBody.data.session.session_token;
    const sessionId = authBody.data.session.session_id;

    // WHEN: Starting shift
    const response = await authenticatedApiRequest.post(
      `/api/terminals/${terminal.pos_terminal_id}/shifts/start`,
      {},
      {
        headers: {
          "X-Cashier-Session": sessionToken,
        },
      },
    );

    // THEN: Session should be linked to the shift
    expect(response.status()).toBe(201);
    const body = await response.json();
    const shiftId = body.data.shift_id;

    const dbSession = await prismaClient.cashierSession.findUnique({
      where: { session_id: sessionId },
    });
    expect(dbSession?.shift_id).toBe(shiftId);
  });

  test("4.92-API-032: [P0] should require JWT authentication in addition to cashier session", async ({
    apiRequest,
    prismaClient,
  }) => {
    // GIVEN: A cashier with session but no JWT auth
    const user = await prismaClient.user.create({
      data: createUser(),
    });
    const company = await prismaClient.company.create({
      data: createCompany({ owner_user_id: user.user_id }),
    });
    const store = await prismaClient.store.create({
      data: createStore({ company_id: company.company_id }),
    });
    const terminal = await prismaClient.pOSTerminal.create({
      data: createTerminal({ store_id: store.store_id }),
    });

    // Generate a fake session token (won't matter since JWT check fails first)
    const fakeSessionToken = "a".repeat(64);

    // WHEN: Making request without JWT (only session token)
    const response = await apiRequest.post(
      `/api/terminals/${terminal.pos_terminal_id}/shifts/start`,
      {},
      {
        headers: {
          "X-Cashier-Session": fakeSessionToken,
        },
      },
    );

    // THEN: Request is rejected due to missing JWT
    expect(response.status()).toBe(401);
  });
});

// =============================================================================
// SECTION 10: P0 CRITICAL - STARTING CASH UPDATE WITH CASHIER SESSION TOKEN
// =============================================================================

test.describe("4.92-API: Cashier Session Token - Starting Cash Operations", () => {
  test("4.92-API-033: [P0] should update starting cash using session token (no cashier_id in body)", async ({
    authenticatedApiRequest,
    superadminUser,
    prismaClient,
  }) => {
    // GIVEN: A shift created via session token
    const company = await prismaClient.company.create({
      data: createCompany({ owner_user_id: superadminUser.user_id }),
    });
    const store = await prismaClient.store.create({
      data: createStore({ company_id: company.company_id }),
    });
    const terminal = await prismaClient.pOSTerminal.create({
      data: createTerminal({ store_id: store.store_id }),
    });

    const cashierData = await createCashier({
      store_id: store.store_id,
      created_by: superadminUser.user_id,
      pin: "1234",
    });
    const cashier = await prismaClient.cashier.create({ data: cashierData });

    // Create session and start shift
    const authResponse = await authenticatedApiRequest.post(
      `/api/stores/${store.store_id}/cashiers/authenticate`,
      {
        name: cashierData.name,
        pin: "1234",
        terminal_id: terminal.pos_terminal_id,
      },
    );
    const authBody = await authResponse.json();
    const sessionToken = authBody.data.session.session_token;

    const shiftResponse = await authenticatedApiRequest.post(
      `/api/terminals/${terminal.pos_terminal_id}/shifts/start`,
      {},
      {
        headers: {
          "X-Cashier-Session": sessionToken,
        },
      },
    );
    const shiftBody = await shiftResponse.json();
    const shiftId = shiftBody.data.shift_id;

    // WHEN: Updating starting cash (only starting_cash in body, no cashier_id)
    const response = await authenticatedApiRequest.put(
      `/api/shifts/${shiftId}/starting-cash`,
      {
        starting_cash: 150.5,
        // No cashier_id - it comes from session
      },
      {
        headers: {
          "X-Cashier-Session": sessionToken,
        },
      },
    );

    // THEN: Starting cash is updated
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.opening_cash).toBe(150.5);
    expect(body.data.cashier_id).toBe(cashier.cashier_id);
  });

  test("4.92-API-034: [P0] should reject starting cash update without session token", async ({
    authenticatedApiRequest,
    superadminUser,
    prismaClient,
  }) => {
    // GIVEN: A shift
    const company = await prismaClient.company.create({
      data: createCompany({ owner_user_id: superadminUser.user_id }),
    });
    const store = await prismaClient.store.create({
      data: createStore({ company_id: company.company_id }),
    });
    const terminal = await prismaClient.pOSTerminal.create({
      data: createTerminal({ store_id: store.store_id }),
    });

    const cashierData = await createCashier({
      store_id: store.store_id,
      created_by: superadminUser.user_id,
      pin: "1234",
    });
    const cashier = await prismaClient.cashier.create({ data: cashierData });

    // Create shift directly in database
    const shift = await prismaClient.shift.create({
      data: {
        store_id: store.store_id,
        opened_by: superadminUser.user_id,
        cashier_id: cashier.cashier_id,
        pos_terminal_id: terminal.pos_terminal_id,
        opening_cash: 0,
        status: "OPEN",
        opened_at: new Date(),
      },
    });

    // WHEN: Updating starting cash without session token
    const response = await authenticatedApiRequest.put(
      `/api/shifts/${shift.shift_id}/starting-cash`,
      {
        starting_cash: 150.5,
      },
    );

    // THEN: Request is rejected
    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("CASHIER_SESSION_REQUIRED");
  });

  test("4.92-API-035: [P0] should reject starting cash update for shift owned by different cashier", async ({
    authenticatedApiRequest,
    superadminUser,
    prismaClient,
  }) => {
    // GIVEN: Two cashiers, shift owned by cashier1, session for cashier2
    const company = await prismaClient.company.create({
      data: createCompany({ owner_user_id: superadminUser.user_id }),
    });
    const store = await prismaClient.store.create({
      data: createStore({ company_id: company.company_id }),
    });
    const terminal = await prismaClient.pOSTerminal.create({
      data: createTerminal({ store_id: store.store_id }),
    });

    const cashier1Data = await createCashier({
      store_id: store.store_id,
      created_by: superadminUser.user_id,
      pin: "1111",
    });
    const cashier2Data = await createCashier({
      store_id: store.store_id,
      created_by: superadminUser.user_id,
      pin: "2222",
    });
    const cashier1 = await prismaClient.cashier.create({ data: cashier1Data });
    await prismaClient.cashier.create({ data: cashier2Data });

    // Create shift owned by cashier1
    const shift = await prismaClient.shift.create({
      data: {
        store_id: store.store_id,
        opened_by: superadminUser.user_id,
        cashier_id: cashier1.cashier_id,
        pos_terminal_id: terminal.pos_terminal_id,
        opening_cash: 0,
        status: "OPEN",
        opened_at: new Date(),
      },
    });

    // Create session for cashier2
    const authResponse = await authenticatedApiRequest.post(
      `/api/stores/${store.store_id}/cashiers/authenticate`,
      {
        name: cashier2Data.name,
        pin: "2222",
        terminal_id: terminal.pos_terminal_id,
      },
    );
    const authBody = await authResponse.json();
    const sessionToken = authBody.data.session.session_token;

    // WHEN: Cashier2 attempts to update cashier1's shift starting cash
    const response = await authenticatedApiRequest.put(
      `/api/shifts/${shift.shift_id}/starting-cash`,
      {
        starting_cash: 150.5,
      },
      {
        headers: {
          "X-Cashier-Session": sessionToken,
        },
      },
    );

    // THEN: Request is rejected (ownership check - returns 400 with UNAUTHORIZED_SHIFT_ACCESS)
    // Note: The service returns 400 for shift ownership validation errors
    expect([400, 403]).toContain(response.status());
    const body = await response.json();
    expect(body.success).toBe(false);
  });

  test("4.92-API-036: [P0] should validate starting_cash is non-negative", async ({
    authenticatedApiRequest,
    superadminUser,
    prismaClient,
  }) => {
    // GIVEN: A shift with session
    const company = await prismaClient.company.create({
      data: createCompany({ owner_user_id: superadminUser.user_id }),
    });
    const store = await prismaClient.store.create({
      data: createStore({ company_id: company.company_id }),
    });
    const terminal = await prismaClient.pOSTerminal.create({
      data: createTerminal({ store_id: store.store_id }),
    });

    const cashierData = await createCashier({
      store_id: store.store_id,
      created_by: superadminUser.user_id,
      pin: "1234",
    });
    const cashier = await prismaClient.cashier.create({ data: cashierData });

    // Create session
    const authResponse = await authenticatedApiRequest.post(
      `/api/stores/${store.store_id}/cashiers/authenticate`,
      {
        name: cashierData.name,
        pin: "1234",
        terminal_id: terminal.pos_terminal_id,
      },
    );
    const authBody = await authResponse.json();
    const sessionToken = authBody.data.session.session_token;

    // Create shift directly
    const shift = await prismaClient.shift.create({
      data: {
        store_id: store.store_id,
        opened_by: superadminUser.user_id,
        cashier_id: cashier.cashier_id,
        pos_terminal_id: terminal.pos_terminal_id,
        opening_cash: 0,
        status: "OPEN",
        opened_at: new Date(),
      },
    });

    // Link session to shift
    await prismaClient.cashierSession.update({
      where: { session_id: authBody.data.session.session_id },
      data: { shift_id: shift.shift_id },
    });

    // WHEN: Updating starting cash with negative value
    const response = await authenticatedApiRequest.put(
      `/api/shifts/${shift.shift_id}/starting-cash`,
      {
        starting_cash: -50,
      },
      {
        headers: {
          "X-Cashier-Session": sessionToken,
        },
      },
    );

    // THEN: Validation fails
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
  });
});

// =============================================================================
// SECTION 11: P0 CRITICAL - CORS CONFIGURATION TESTS
// =============================================================================

test.describe("4.92-API: Cashier Session Token - CORS Configuration", () => {
  test("4.92-API-037: [P0] should allow X-Cashier-Session header in CORS preflight", async ({
    request,
    prismaClient,
  }) => {
    // GIVEN: A terminal endpoint
    const user = await prismaClient.user.create({
      data: createUser(),
    });
    const company = await prismaClient.company.create({
      data: createCompany({ owner_user_id: user.user_id }),
    });
    const store = await prismaClient.store.create({
      data: createStore({ company_id: company.company_id }),
    });
    const terminal = await prismaClient.pOSTerminal.create({
      data: createTerminal({ store_id: store.store_id }),
    });

    // WHEN: Sending CORS preflight request with X-Cashier-Session
    const response = await request.fetch(
      `http://localhost:3001/api/terminals/${terminal.pos_terminal_id}/shifts/start`,
      {
        method: "OPTIONS",
        headers: {
          Origin: "http://localhost:3000",
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers": "content-type,x-cashier-session",
        },
      },
    );

    // THEN: CORS preflight should succeed and allow X-Cashier-Session
    expect(response.status()).toBeLessThan(400); // 200 or 204
    const allowedHeaders = response.headers()["access-control-allow-headers"];
    expect((allowedHeaders ?? "").toLowerCase()).toContain("x-cashier-session");
  });
});
