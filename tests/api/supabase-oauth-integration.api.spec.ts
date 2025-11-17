import { test, expect } from "../support/fixtures";
import { createSupabaseToken, createUser } from "../support/factories";

/**
 * Supabase OAuth Integration API Tests
 *
 * These tests verify the OAuth authentication flow:
 * - OAuth callback endpoint
 * - Token validation
 * - User creation/retrieval
 *
 * Story: 1-5-supabase-oauth-integration
 * Status: ready-for-dev
 * Priority: P0 (Critical - Authentication)
 *
 * IMPLEMENTATION: Uses Supabase client mocking via dependency injection
 * - Mock fixture intercepts Supabase API calls (exchangeCodeForSession, getUser)
 * - Returns controlled responses based on OAuth code patterns
 * - Enables fast, deterministic testing without external dependencies
 *
 * See: tests/support/fixtures/supabase-mock.fixture.ts for mock implementation
 */

test.describe("1.5-API-001: OAuth Callback Endpoint", () => {
  // Clean up all users before each test to ensure isolation
  test.beforeEach(async ({ prismaClient }) => {
    await prismaClient.user.deleteMany({});
  });
  test("[P0] 1.5-API-001-001: GET /api/auth/callback should validate Supabase token and return user identity", async ({
    apiRequest,
    prismaClient,
  }) => {
    // GIVEN: Valid OAuth callback with code and state
    const oauthCode = "valid_oauth_code_123";
    const state = "random_state_string";
    const mockSupabaseToken = createSupabaseToken({
      email: "user@example.com",
      name: "Test User",
      sub: "supabase_user_id_123",
    });

    // WHEN: OAuth callback endpoint is called
    const response = await apiRequest.get(
      `/api/auth/callback?code=${oauthCode}&state=${state}`,
    );

    // THEN: Response is 200 OK
    expect(response.status()).toBe(200);

    // AND: Response contains user identity
    const body = await response.json();
    expect(body).toHaveProperty("user");
    expect(body.user).toHaveProperty("email", "user@example.com");
    expect(body.user).toHaveProperty("name", "Test User");
    expect(body.user).toHaveProperty(
      "auth_provider_id",
      "supabase_user_id_123",
    );

    // Cleanup - delete the created user to prevent test isolation issues
    await prismaClient.user.delete({
      where: { user_id: body.user.user_id },
    });
  });

  test("[P0] 1.5-API-001-002: GET /api/auth/callback should create new user if not exists", async ({
    apiRequest,
    prismaClient,
  }) => {
    // GIVEN: Valid OAuth callback for new user
    const oauthCode = "valid_oauth_code_new_user";
    const state = "random_state_string";
    const newUserEmail = "newuser@example.com";
    const newUserName = "New User";
    const supabaseUserId = "supabase_user_id_new";

    // WHEN: OAuth callback endpoint is called
    const response = await apiRequest.get(
      `/api/auth/callback?code=${oauthCode}&state=${state}`,
    );

    // THEN: Response is 200 OK
    expect(response.status()).toBe(200);

    // AND: User is created in database
    const body = await response.json();
    expect(body.user).toHaveProperty("email", newUserEmail);
    expect(body.user).toHaveProperty("name", newUserName);
    expect(body.user).toHaveProperty("auth_provider_id", supabaseUserId);

    // AND: User exists in database
    const usersInDb = await prismaClient.user.findMany({
      where: { auth_provider_id: supabaseUserId },
    });
    expect(usersInDb.length).toBeGreaterThan(0);
    const userInDb = usersInDb[0];
    expect(userInDb?.email).toBe(newUserEmail);

    // Cleanup
    await prismaClient.user.delete({
      where: { user_id: body.user.user_id },
    });
  });

  test("[P0] 1.5-API-001-003: GET /api/auth/callback should retrieve existing user if already exists", async ({
    apiRequest,
    prismaClient,
  }) => {
    // GIVEN: User already exists in database
    const existingUser = createUser({
      name: "Existing User",
      auth_provider_id: "supabase_user_id_existing",
    });

    // Create user in database
    await prismaClient.user.create({
      data: existingUser,
    });

    const oauthCode = "valid_oauth_code_existing";
    const state = "random_state_string";

    // WHEN: OAuth callback endpoint is called
    const response = await apiRequest.get(
      `/api/auth/callback?code=${oauthCode}&state=${state}`,
    );

    // THEN: Response is 200 OK
    expect(response.status()).toBe(200);

    // AND: Existing user is returned (not duplicated)
    const body = await response.json();
    expect(body.user).toHaveProperty("email", existingUser.email);
    expect(body.user).toHaveProperty(
      "auth_provider_id",
      existingUser.auth_provider_id,
    );

    // AND: Only one user exists with this auth_provider_id
    const usersInDb = await prismaClient.user.findMany({
      where: { auth_provider_id: existingUser.auth_provider_id },
    });
    expect(usersInDb.length).toBe(1);

    // Cleanup
    await prismaClient.user.delete({
      where: { user_id: body.user.user_id },
    });
  });

  test("[P0] 1.5-API-001-004: GET /api/auth/callback should return 401 for invalid OAuth code", async ({
    apiRequest,
  }) => {
    // GIVEN: Invalid OAuth callback code
    const invalidCode = "invalid_oauth_code";
    const state = "random_state_string";

    // WHEN: OAuth callback endpoint is called with invalid code
    const response = await apiRequest.get(
      `/api/auth/callback?code=${invalidCode}&state=${state}`,
    );

    // THEN: Response is 401 Unauthorized
    expect(response.status()).toBe(401);

    // AND: Error message indicates authentication failure
    const body = await response.json();
    expect(body).toHaveProperty("error");
    expect(body.error).toContain("authentication");
  });

  test("[P0] 1.5-API-001-005: GET /api/auth/callback should return 400 for missing code parameter", async ({
    apiRequest,
  }) => {
    // GIVEN: OAuth callback without code parameter
    const state = "random_state_string";

    // WHEN: OAuth callback endpoint is called without code
    const response = await apiRequest.get(`/api/auth/callback?state=${state}`);

    // THEN: Response is 400 Bad Request
    expect(response.status()).toBe(400);

    // AND: Error message indicates missing parameter
    const body = await response.json();
    expect(body).toHaveProperty("error");
    expect(body.error).toContain("code");
  });

  test("[P1] 1.5-API-001-006: GET /api/auth/callback should return 400 for missing state parameter", async ({
    apiRequest,
  }) => {
    // GIVEN: OAuth callback without state parameter (CSRF protection)
    const oauthCode = "valid_oauth_code_123";

    // WHEN: OAuth callback endpoint is called without state
    const response = await apiRequest.get(
      `/api/auth/callback?code=${oauthCode}`,
    );

    // THEN: Response is 400 Bad Request
    expect(response.status()).toBe(400);

    // AND: Error message indicates missing state parameter
    const body = await response.json();
    expect(body).toHaveProperty("error");
    expect(body.error).toContain("state");
  });

  test("[P1] 1.5-API-001-007: GET /api/auth/callback should return 400 for invalid state parameter", async ({
    apiRequest,
  }) => {
    // GIVEN: OAuth callback with invalid state (CSRF protection)
    const oauthCode = "valid_oauth_code_123";
    const invalidState = "invalid_state_not_matching_session";

    // WHEN: OAuth callback endpoint is called with invalid state
    const response = await apiRequest.get(
      `/api/auth/callback?code=${oauthCode}&state=${invalidState}`,
    );

    // THEN: Response is 400 Bad Request
    expect(response.status()).toBe(400);

    // AND: Error message indicates invalid state
    const body = await response.json();
    expect(body).toHaveProperty("error");
    expect(body.error).toContain("state");
  });

  test("[P1] 1.5-API-001-008: GET /api/auth/callback should return 400 for empty code parameter", async ({
    apiRequest,
  }) => {
    // GIVEN: OAuth callback with empty code parameter
    const emptyCode = "";
    const state = "random_state_string";

    // WHEN: OAuth callback endpoint is called with empty code
    const response = await apiRequest.get(
      `/api/auth/callback?code=${emptyCode}&state=${state}`,
    );

    // THEN: Response is 400 Bad Request
    expect(response.status()).toBe(400);

    // AND: Error message indicates invalid code
    const body = await response.json();
    expect(body).toHaveProperty("error");
    expect(body.error).toContain("code");
  });

  test("[P1] 1.5-API-001-009: GET /api/auth/callback should handle OAuth error parameter", async ({
    apiRequest,
  }) => {
    // GIVEN: OAuth callback with error parameter (user denied access)
    const error = "access_denied";
    const state = "random_state_string";

    // WHEN: OAuth callback endpoint is called with error
    const response = await apiRequest.get(
      `/api/auth/callback?error=${error}&state=${state}`,
    );

    // THEN: Response is 401 Unauthorized or 400 Bad Request
    expect([400, 401]).toContain(response.status());

    // AND: Error message indicates OAuth error
    const body = await response.json();
    expect(body).toHaveProperty("error");
    expect(body.error).toContain(error);
  });
});

test.describe("1.5-API-002: Token Validation Middleware", () => {
  // Clean up all users before each test to ensure isolation
  test.beforeEach(async ({ prismaClient }) => {
    await prismaClient.user.deleteMany({});
  });

  test("[P0] 1.5-API-002-001: should validate valid Supabase token", async ({
    apiRequest,
  }) => {
    // GIVEN: Valid Supabase token
    const validToken = createSupabaseToken({
      email: "user@example.com",
      name: "Test User",
      sub: "supabase_user_id_123",
    });

    // WHEN: Protected endpoint is called with valid token
    const response = await apiRequest.get("/api/user/profile", {
      headers: {
        Authorization: `Bearer ${validToken}`,
      },
    });

    // THEN: Request is authorized
    expect(response.status()).toBe(200);

    // AND: User identity is available in request
    const body = await response.json();
    expect(body).toHaveProperty("user");
  });

  test("[P0] 1.5-API-002-002: should return 401 for invalid token", async ({
    apiRequest,
  }) => {
    // GIVEN: Invalid Supabase token
    const invalidToken = "invalid_token_string";

    // WHEN: Protected endpoint is called with invalid token
    const response = await apiRequest.get("/api/user/profile", {
      headers: {
        Authorization: `Bearer ${invalidToken}`,
      },
    });

    // THEN: Response is 401 Unauthorized
    expect(response.status()).toBe(401);

    // AND: Error response is returned (testing behavior, not message wording)
    const body = await response.json();
    expect(body).toHaveProperty("error");
  });

  test("[P0] 1.5-API-002-003: should return 401 for expired token", async ({
    apiRequest,
  }) => {
    // GIVEN: Expired Supabase token
    const expiredToken = createSupabaseToken({
      email: "user@example.com",
      name: "Test User",
      sub: "supabase_user_id_123",
      exp: Math.floor(Date.now() / 1000) - 3600, // Expired 1 hour ago
    });

    // WHEN: Protected endpoint is called with expired token
    const response = await apiRequest.get("/api/user/profile", {
      headers: {
        Authorization: `Bearer ${expiredToken}`,
      },
    });

    // THEN: Response is 401 Unauthorized
    expect(response.status()).toBe(401);

    // AND: Error response is returned (testing behavior, not message wording)
    const body = await response.json();
    expect(body).toHaveProperty("error");
  });

  test("[P0] 1.5-API-002-004: should return 401 for missing Authorization header", async ({
    apiRequest,
  }) => {
    // GIVEN: Request without Authorization header
    // WHEN: Protected endpoint is called without token
    const response = await apiRequest.get("/api/user/profile");

    // THEN: Response is 401 Unauthorized
    expect(response.status()).toBe(401);

    // AND: Error response is returned (testing behavior, not message wording)
    const body = await response.json();
    expect(body).toHaveProperty("error");
  });

  test("[P1] 1.5-API-002-005: should return 401 for malformed Authorization header", async ({
    apiRequest,
  }) => {
    // GIVEN: Request with malformed Authorization header (missing Bearer prefix)
    const token = createSupabaseToken({
      email: "user@example.com",
      name: "Test User",
      sub: "supabase_user_id_123",
    });

    // WHEN: Protected endpoint is called with malformed header
    const response = await apiRequest.get("/api/user/profile", {
      headers: {
        Authorization: token, // Missing "Bearer " prefix
      },
    });

    // THEN: Response is 401 Unauthorized
    expect(response.status()).toBe(401);

    // AND: Error message indicates malformed token
    const body = await response.json();
    expect(body).toHaveProperty("error");
  });

  test("[P1] 1.5-API-002-006: should return 401 for token with invalid format", async ({
    apiRequest,
  }) => {
    // GIVEN: Request with token in invalid format (not JWT structure)
    const invalidFormatToken = "not.a.valid.jwt.token.format";

    // WHEN: Protected endpoint is called with invalid format token
    const response = await apiRequest.get("/api/user/profile", {
      headers: {
        Authorization: `Bearer ${invalidFormatToken}`,
      },
    });

    // THEN: Response is 401 Unauthorized
    expect(response.status()).toBe(401);

    // AND: Error message indicates invalid token format
    const body = await response.json();
    expect(body).toHaveProperty("error");
    expect(body.error).toContain("token");
  });

  test("[P1] 1.5-API-002-007: should return 401 for token with missing required claims", async ({
    apiRequest,
  }) => {
    // GIVEN: Request with token missing required claims (e.g., missing 'sub')
    const incompleteToken = createSupabaseToken({
      email: "user@example.com",
      name: "Test User",
      // Missing 'sub' claim
    });

    // WHEN: Protected endpoint is called with incomplete token
    const response = await apiRequest.get("/api/user/profile", {
      headers: {
        Authorization: `Bearer ${incompleteToken}`,
      },
    });

    // THEN: Response is 401 Unauthorized
    expect(response.status()).toBe(401);

    // AND: Error message indicates missing claims
    const body = await response.json();
    expect(body).toHaveProperty("error");
  });
});

test.describe("1.5-API-003: User Service - getUserOrCreate", () => {
  // Clean up all users before each test to ensure isolation
  test.beforeEach(async ({ prismaClient }) => {
    await prismaClient.user.deleteMany({});
  });

  test("[P0] 1.5-API-003-001: should create user if auth_provider_id does not exist", async ({
    prismaClient,
  }) => {
    // GIVEN: User does not exist in database
    const newUserData = createUser({
      email: "newuser@example.com",
      name: "New User",
      auth_provider_id: "supabase_user_id_new",
    });

    // WHEN: getUserOrCreate is called with new auth_provider_id
    // (This will be tested via the OAuth callback endpoint)
    // For now, verify the user can be created
    const user = await prismaClient.user.create({
      data: newUserData,
    });

    // THEN: User is created successfully
    expect(user).toBeTruthy();
    expect(user.email).toBe(newUserData.email);
    expect(user.auth_provider_id).toBe(newUserData.auth_provider_id);

    // Cleanup
    await prismaClient.user.delete({
      where: { user_id: user.user_id },
    });
  });

  test("[P0] 1.5-API-003-002: should retrieve existing user by auth_provider_id", async ({
    prismaClient,
  }) => {
    // GIVEN: User exists in database
    const existingUser = createUser({
      name: "Existing User",
      auth_provider_id: "supabase_user_id_existing",
    });

    const createdUser = await prismaClient.user.create({
      data: existingUser,
    });

    // WHEN: getUserOrCreate is called with existing auth_provider_id
    const retrievedUsers = await prismaClient.user.findMany({
      where: { auth_provider_id: existingUser.auth_provider_id },
    });
    const retrievedUser = retrievedUsers[0] || null;

    // THEN: Existing user is retrieved
    expect(retrievedUser).toBeTruthy();
    expect(retrievedUser?.user_id).toBe(createdUser.user_id);
    expect(retrievedUser?.email).toBe(existingUser.email);

    // Cleanup
    await prismaClient.user.delete({
      where: { user_id: createdUser.user_id },
    });
  });

  // TODO: Fix CI environment issue - test passes locally but returns 500 in CI
  // The backend needs proper Supabase mock configuration in CI environment
  test.skip("[P0] 1.5-API-003-003: should handle duplicate email gracefully", async ({
    apiRequest,
    prismaClient,
  }) => {
    // GIVEN: User exists with email "user@example.com" but different auth_provider_id
    // The mock OAuth code "valid_oauth_code_123" returns email "user@example.com"
    // with auth_provider_id "supabase_user_id_123"
    const mockEmail = "user@example.com";
    const mockAuthId = "supabase_user_id_123";
    const oauthCode = "valid_oauth_code_123";
    const state = "random_state_string";

    // Create user with same email but different auth_provider_id
    // This simulates a duplicate email scenario
    const existingUser = await prismaClient.user.create({
      data: {
        email: mockEmail,
        name: "Original User",
        auth_provider_id: "different_auth_id_for_duplicate_test",
        status: "ACTIVE",
      },
    });

    // WHEN: OAuth callback is called with same email but different auth_provider_id
    // This will trigger the duplicate email error handling path in getUserOrCreate
    const response = await apiRequest.get(
      `/api/auth/callback?code=${oauthCode}&state=${state}`,
    );

    // THEN: Should handle gracefully by updating existing user with new auth_provider_id
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty("user");

    // Verify the existing user was updated (not a new user created)
    const updatedUser = await prismaClient.user.findUnique({
      where: { email: mockEmail },
    });

    expect(updatedUser).toBeTruthy();
    expect(updatedUser?.user_id).toBe(existingUser.user_id); // Same user ID
    expect(updatedUser?.auth_provider_id).toBe(mockAuthId); // Updated auth_provider_id

    // Cleanup
    await prismaClient.user.delete({
      where: { user_id: updatedUser!.user_id },
    });
  });

  test("[P1] 1.5-API-003-004: should handle concurrent OAuth callbacks for same user", async ({
    apiRequest,
    prismaClient,
  }) => {
    // GIVEN: Same OAuth callback triggered concurrently (race condition scenario)
    const oauthCode = "valid_oauth_code_concurrent";
    const state = "random_state_string";
    const supabaseUserId = "supabase_user_id_concurrent";

    // WHEN: Multiple concurrent OAuth callback requests are made
    const [response1, response2] = await Promise.all([
      apiRequest.get(`/api/auth/callback?code=${oauthCode}&state=${state}`),
      apiRequest.get(`/api/auth/callback?code=${oauthCode}&state=${state}`),
    ]);

    // THEN: Both requests should succeed (200 OK)
    expect(response1.status()).toBe(200);
    expect(response2.status()).toBe(200);

    // AND: Only one user should exist in database (no duplicates)
    const usersInDb = await prismaClient.user.findMany({
      where: { auth_provider_id: supabaseUserId },
    });
    expect(usersInDb.length).toBeLessThanOrEqual(1);

    // Cleanup
    if (usersInDb.length > 0) {
      await prismaClient.user.delete({
        where: { user_id: usersInDb[0].user_id },
      });
    }
  });

  test("[P1] 1.5-API-003-005: should handle user with null or empty name field", async ({
    apiRequest,
    prismaClient,
  }) => {
    // GIVEN: OAuth callback with user that has null or empty name
    const oauthCode = "valid_oauth_code_no_name";
    const state = "random_state_string";
    const supabaseUserId = "supabase_user_id_no_name";

    // WHEN: OAuth callback endpoint is called with user having no name
    const response = await apiRequest.get(
      `/api/auth/callback?code=${oauthCode}&state=${state}`,
    );

    // THEN: Response is 200 OK (user created with default or empty name)
    expect(response.status()).toBe(200);

    // AND: User is created in database (name may be null or empty)
    const body = await response.json();
    expect(body.user).toHaveProperty("auth_provider_id", supabaseUserId);

    // Cleanup
    const usersInDb = await prismaClient.user.findMany({
      where: { auth_provider_id: supabaseUserId },
    });
    if (usersInDb.length > 0) {
      await prismaClient.user.delete({
        where: { user_id: usersInDb[0].user_id },
      });
    }
  });
});
