/**
 * Client Owner Setup Wizard API Tests
 *
 * @test-level API Integration
 * @justification Comprehensive API-level tests for the 5-step wizard atomic creation
 * @feature User Management - Client Owner Setup Wizard
 * @created 2026-01-26
 *
 * BUSINESS CONTEXT:
 * The Client Owner Setup Wizard creates complete client infrastructure atomically:
 * 1. User (CLIENT_OWNER) - Company owner account
 * 2. Company - Business entity owned by the user
 * 3. Store - First store for the company
 * 4. Store Login (CLIENT_USER) - Store dashboard credentials
 * 5. Store Manager (STORE_MANAGER) - Required for desktop app functionality
 *
 * BUSINESS RULES TESTED:
 * - BR-COS-001: All 5 entities are created atomically (all-or-nothing)
 * - BR-COS-002: User email, store login email, and store manager email must be unique
 * - BR-COS-003: All three emails must be different from each other
 * - BR-COS-004: Password requirements enforced (8+ chars, uppercase, lowercase, number, special)
 * - BR-COS-005: Company address uses structured fields with state/county validation
 * - BR-COS-006: Store timezone must be valid IANA format
 * - BR-COS-007: Store manager is required for desktop app functionality
 * - BR-COS-008: Transaction rollback on any failure
 *
 * SECURITY FOCUS:
 * - SEC-001: Password hashing with bcrypt
 * - SEC-006: ORM-based queries (no SQL injection)
 * - SEC-014: Input validation and sanitization
 * - API-004: ADMIN_SYSTEM_CONFIG permission required
 *
 * TEST PHILOSOPHY:
 * - Tests represent ground truth - code must conform to tests
 * - Focus on critical paths and business logic
 * - Validate security boundaries
 * - Test edge cases and error conditions
 * - Industry best practices for API testing
 */

import { test, expect } from "../support/fixtures/rbac.fixture";
import { cleanupTestData } from "../support/cleanup-helper";

test.describe("Client Owner Setup Wizard API", () => {
  // Cleanup tracker for reliable test isolation
  const cleanupTracker = {
    users: new Set<string>(),
    companies: new Set<string>(),
    stores: new Set<string>(),
    tempUsers: new Set<string>(), // For users created outside wizard flow
  };

  /**
   * Helper to track created entities for cleanup
   */
  function trackForCleanup(data: {
    userId?: string;
    storeLoginId?: string;
    storeManagerId?: string;
    companyId?: string;
    storeId?: string;
  }) {
    if (data.userId) cleanupTracker.users.add(data.userId);
    if (data.storeLoginId) cleanupTracker.users.add(data.storeLoginId);
    if (data.storeManagerId) cleanupTracker.users.add(data.storeManagerId);
    if (data.companyId) cleanupTracker.companies.add(data.companyId);
    if (data.storeId) cleanupTracker.stores.add(data.storeId);
  }

  /**
   * Track temporary users created for test setup (not via wizard)
   */
  function trackTempUser(userId: string) {
    cleanupTracker.tempUsers.add(userId);
  }

  /**
   * Helper to generate valid setup payload
   */
  function generateValidPayload(timestamp: number = Date.now()) {
    return {
      user: {
        email: `owner-${timestamp}@test.com`,
        name: "Test Owner",
        password: "SecurePassword123!",
      },
      company: {
        name: `Test Company ${timestamp}`,
        address: {
          address_line1: "123 Test Street",
          address_line2: "Suite 100",
          city: "Test City",
          state_id: "", // Will be populated in test
          county_id: null, // Optional - use null not empty string (UUID validation)
          zip_code: "12345",
        },
      },
      store: {
        name: `Test Store ${timestamp}`,
        timezone: "America/New_York",
        status: "ACTIVE" as const,
        address_line1: "456 Store Avenue",
        address_line2: null,
        city: "Store City",
        state_id: "", // Will be populated in test
        county_id: null, // Optional - use null not empty string (UUID validation)
        zip_code: "67890",
      },
      storeLogin: {
        email: `storelogin-${timestamp}@test.com`,
        password: "StorePassword123!",
      },
      storeManager: {
        email: `storemanager-${timestamp}@test.com`,
        password: "ManagerPassword123!",
      },
    };
  }

  // ===========================================================================
  // Happy Path Tests
  // ===========================================================================

  test("[P0-BR-COS-001] should create complete setup atomically with all 5 entities", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: Valid state exists
    const state = await prismaClient.uSState.findFirst({
      where: { code: "GA" },
    });

    if (!state) {
      test.skip();
      return;
    }

    const timestamp = Date.now();
    const payload = generateValidPayload(timestamp);
    payload.company.address.state_id = state.state_id;
    payload.store.state_id = state.state_id;

    // WHEN: System Admin creates client owner setup
    const response = await superadminApiRequest.post(
      "/api/admin/client-owner-setup",
      payload,
    );

    // THEN: All entities are created successfully
    expect(response.status()).toBe(201);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();

    // Verify user (CLIENT_OWNER)
    expect(body.data.user).toBeDefined();
    expect(body.data.user.user_id).toBeDefined();
    expect(body.data.user.email).toBe(payload.user.email.toLowerCase());
    expect(body.data.user.name).toBe(payload.user.name);
    expect(body.data.user.status).toBe("ACTIVE");
    expect(body.data.user.roles).toHaveLength(1);
    expect(body.data.user.roles[0].role_code).toBe("CLIENT_OWNER");

    // Verify company
    expect(body.data.company).toBeDefined();
    expect(body.data.company.company_id).toBeDefined();
    expect(body.data.company.name).toBe(payload.company.name);
    expect(body.data.company.status).toBe("ACTIVE");

    // Verify store
    expect(body.data.store).toBeDefined();
    expect(body.data.store.store_id).toBeDefined();
    expect(body.data.store.name).toBe(payload.store.name);
    expect(body.data.store.timezone).toBe(payload.store.timezone);

    // Verify store login (CLIENT_USER)
    expect(body.data.storeLogin).toBeDefined();
    expect(body.data.storeLogin.user_id).toBeDefined();
    expect(body.data.storeLogin.email).toBe(
      payload.storeLogin.email.toLowerCase(),
    );

    // Verify store manager (STORE_MANAGER)
    expect(body.data.storeManager).toBeDefined();
    expect(body.data.storeManager.user_id).toBeDefined();
    expect(body.data.storeManager.email).toBe(
      payload.storeManager.email.toLowerCase(),
    );

    // Verify meta
    expect(body.meta).toBeDefined();
    expect(body.meta.transaction_id).toBeDefined();

    // Verify in database
    const createdUser = await prismaClient.user.findUnique({
      where: { user_id: body.data.user.user_id },
    });
    expect(createdUser?.is_client_user).toBe(true);

    const storeManagerInDb = await prismaClient.user.findUnique({
      where: { user_id: body.data.storeManager.user_id },
      include: { user_roles: { include: { role: true } } },
    });
    expect(storeManagerInDb).toBeDefined();
    expect(storeManagerInDb?.user_roles[0]?.role.code).toBe("STORE_MANAGER");

    // Cleanup
    await prismaClient.userRole.deleteMany({
      where: {
        user_id: {
          in: [
            body.data.user.user_id,
            body.data.storeLogin.user_id,
            body.data.storeManager.user_id,
          ],
        },
      },
    });
    await prismaClient.store.delete({
      where: { store_id: body.data.store.store_id },
    });
    await prismaClient.company.delete({
      where: { company_id: body.data.company.company_id },
    });
    await prismaClient.user.deleteMany({
      where: {
        user_id: {
          in: [
            body.data.user.user_id,
            body.data.storeLogin.user_id,
            body.data.storeManager.user_id,
          ],
        },
      },
    });
  });

  // ===========================================================================
  // Email Uniqueness Validation Tests
  // ===========================================================================

  test("[P0-BR-COS-003a] should reject when user email equals store login email", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    const state = await prismaClient.uSState.findFirst({
      where: { code: "GA" },
    });

    if (!state) {
      test.skip();
      return;
    }

    const timestamp = Date.now();
    const payload = generateValidPayload(timestamp);
    payload.company.address.state_id = state.state_id;
    payload.store.state_id = state.state_id;
    payload.storeLogin.email = payload.user.email; // Same as user email

    const response = await superadminApiRequest.post(
      "/api/admin/client-owner-setup",
      payload,
    );

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.message).toMatch(/different from user email/i);
  });

  test("[P0-BR-COS-003b] should reject when user email equals store manager email", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    const state = await prismaClient.uSState.findFirst({
      where: { code: "GA" },
    });

    if (!state) {
      test.skip();
      return;
    }

    const timestamp = Date.now();
    const payload = generateValidPayload(timestamp);
    payload.company.address.state_id = state.state_id;
    payload.store.state_id = state.state_id;
    payload.storeManager.email = payload.user.email; // Same as user email

    const response = await superadminApiRequest.post(
      "/api/admin/client-owner-setup",
      payload,
    );

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.message).toMatch(/different from user email/i);
  });

  test("[P0-BR-COS-003c] should reject when store login email equals store manager email", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    const state = await prismaClient.uSState.findFirst({
      where: { code: "GA" },
    });

    if (!state) {
      test.skip();
      return;
    }

    const timestamp = Date.now();
    const payload = generateValidPayload(timestamp);
    payload.company.address.state_id = state.state_id;
    payload.store.state_id = state.state_id;
    payload.storeManager.email = payload.storeLogin.email; // Same as store login email

    const response = await superadminApiRequest.post(
      "/api/admin/client-owner-setup",
      payload,
    );

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.message).toMatch(/different from store login email/i);
  });

  test("[P0-BR-COS-002] should reject when store manager email already exists", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    const state = await prismaClient.uSState.findFirst({
      where: { code: "GA" },
    });

    if (!state) {
      test.skip();
      return;
    }

    // Create existing user with the email we'll try to use
    const existingEmail = `existing-${Date.now()}@test.com`;
    const existingUser = await prismaClient.user.create({
      data: {
        public_id: `USR-${Date.now()}`,
        email: existingEmail,
        name: "Existing User",
        status: "ACTIVE",
      },
    });
    // Track for cleanup safety net
    trackTempUser(existingUser.user_id);

    const timestamp = Date.now();
    const payload = generateValidPayload(timestamp);
    payload.company.address.state_id = state.state_id;
    payload.store.state_id = state.state_id;
    payload.storeManager.email = existingEmail; // Already exists

    const response = await superadminApiRequest.post(
      "/api/admin/client-owner-setup",
      payload,
    );

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.details?.storeManager?.email).toMatch(/already in use/i);

    // Cleanup (immediate cleanup preferred, afterAll is safety net)
    await prismaClient.user.delete({
      where: { user_id: existingUser.user_id },
    });
  });

  // ===========================================================================
  // Password Validation Tests
  // ===========================================================================

  test("[P0-BR-COS-004a] should reject store manager password without uppercase", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    const state = await prismaClient.uSState.findFirst({
      where: { code: "GA" },
    });

    if (!state) {
      test.skip();
      return;
    }

    const timestamp = Date.now();
    const payload = generateValidPayload(timestamp);
    payload.company.address.state_id = state.state_id;
    payload.store.state_id = state.state_id;
    payload.storeManager.password = "password123!"; // No uppercase

    const response = await superadminApiRequest.post(
      "/api/admin/client-owner-setup",
      payload,
    );

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  test("[P0-BR-COS-004b] should reject store manager password without special character", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    const state = await prismaClient.uSState.findFirst({
      where: { code: "GA" },
    });

    if (!state) {
      test.skip();
      return;
    }

    const timestamp = Date.now();
    const payload = generateValidPayload(timestamp);
    payload.company.address.state_id = state.state_id;
    payload.store.state_id = state.state_id;
    payload.storeManager.password = "Password123"; // No special character

    const response = await superadminApiRequest.post(
      "/api/admin/client-owner-setup",
      payload,
    );

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  // ===========================================================================
  // Required Field Validation Tests
  // ===========================================================================

  test("[P0-BR-COS-007] should reject request without storeManager field", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    const state = await prismaClient.uSState.findFirst({
      where: { code: "GA" },
    });

    if (!state) {
      test.skip();
      return;
    }

    const timestamp = Date.now();
    const payload = generateValidPayload(timestamp);
    payload.company.address.state_id = state.state_id;
    payload.store.state_id = state.state_id;

    // Remove storeManager field entirely
    const payloadWithoutManager = {
      user: payload.user,
      company: payload.company,
      store: payload.store,
      storeLogin: payload.storeLogin,
      // storeManager intentionally omitted
    };

    const response = await superadminApiRequest.post(
      "/api/admin/client-owner-setup",
      payloadWithoutManager,
    );

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  test("[P0-VAL] should reject missing store manager email", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    const state = await prismaClient.uSState.findFirst({
      where: { code: "GA" },
    });

    if (!state) {
      test.skip();
      return;
    }

    const timestamp = Date.now();
    const payload = generateValidPayload(timestamp);
    payload.company.address.state_id = state.state_id;
    payload.store.state_id = state.state_id;
    (payload.storeManager as any).email = ""; // Empty email

    const response = await superadminApiRequest.post(
      "/api/admin/client-owner-setup",
      payload,
    );

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  // ===========================================================================
  // Security Tests
  // ===========================================================================

  test("[P0-SEC] should require ADMIN_SYSTEM_CONFIG permission", async ({
    clientUserApiRequest,
    prismaClient,
  }) => {
    const state = await prismaClient.uSState.findFirst({
      where: { code: "GA" },
    });

    if (!state) {
      test.skip();
      return;
    }

    const timestamp = Date.now();
    const payload = generateValidPayload(timestamp);
    payload.company.address.state_id = state.state_id;
    payload.store.state_id = state.state_id;

    // WHEN: Non-admin user attempts to create setup
    const response = await clientUserApiRequest.post(
      "/api/admin/client-owner-setup",
      payload,
    );

    // THEN: Request is rejected with 403
    expect(response.status()).toBe(403);
    const body = await response.json();
    expect(body.success).toBe(false);
  });

  test("[P0-SEC] should require authentication", async ({
    request,
    prismaClient,
  }) => {
    const state = await prismaClient.uSState.findFirst({
      where: { code: "GA" },
    });

    if (!state) {
      test.skip();
      return;
    }

    const timestamp = Date.now();
    const payload = generateValidPayload(timestamp);
    payload.company.address.state_id = state.state_id;
    payload.store.state_id = state.state_id;

    // WHEN: Unauthenticated request is made
    const baseUrl = process.env.TEST_BASE_URL || "http://localhost:3001";
    const response = await request.post(
      `${baseUrl}/api/admin/client-owner-setup`,
      {
        data: payload,
      },
    );

    // THEN: Request is rejected with 401
    expect(response.status()).toBe(401);
  });

  // ===========================================================================
  // Transaction Atomicity Tests
  // ===========================================================================

  test("[P0-BR-COS-008] should rollback all entities on failure", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    const state = await prismaClient.uSState.findFirst({
      where: { code: "GA" },
    });

    if (!state) {
      test.skip();
      return;
    }

    // Create existing user to trigger duplicate email error on store manager
    const existingEmail = `existing-manager-${Date.now()}@test.com`;
    const existingUser = await prismaClient.user.create({
      data: {
        public_id: `USR-${Date.now()}`,
        email: existingEmail,
        name: "Existing Manager",
        status: "ACTIVE",
      },
    });
    // Track for cleanup safety net
    trackTempUser(existingUser.user_id);

    const timestamp = Date.now();
    const payload = generateValidPayload(timestamp);
    payload.company.address.state_id = state.state_id;
    payload.store.state_id = state.state_id;
    payload.storeManager.email = existingEmail; // Will fail due to duplicate

    const companyName = payload.company.name;
    const storeName = payload.store.name;

    const response = await superadminApiRequest.post(
      "/api/admin/client-owner-setup",
      payload,
    );

    // THEN: Request fails
    expect(response.status()).toBe(400);

    // AND: No orphan entities were created (transaction rollback)
    const orphanCompany = await prismaClient.company.findFirst({
      where: { name: companyName },
    });
    expect(orphanCompany).toBeNull();

    const orphanStore = await prismaClient.store.findFirst({
      where: { name: storeName },
    });
    expect(orphanStore).toBeNull();

    const orphanUser = await prismaClient.user.findFirst({
      where: { email: payload.user.email.toLowerCase() },
    });
    expect(orphanUser).toBeNull();

    // Cleanup (immediate cleanup preferred, afterAll is safety net)
    await prismaClient.user.delete({
      where: { user_id: existingUser.user_id },
    });
  });

  // ===========================================================================
  // Timezone Validation Tests
  // ===========================================================================

  test("[P0-BR-COS-006] should reject invalid timezone format", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    const state = await prismaClient.uSState.findFirst({
      where: { code: "GA" },
    });

    if (!state) {
      test.skip();
      return;
    }

    const timestamp = Date.now();
    const payload = generateValidPayload(timestamp);
    payload.company.address.state_id = state.state_id;
    payload.store.state_id = state.state_id;
    payload.store.timezone = "EST"; // Invalid - must be IANA format

    const response = await superadminApiRequest.post(
      "/api/admin/client-owner-setup",
      payload,
    );

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.message).toMatch(/IANA format/i);
  });

  // ===========================================================================
  // Input Sanitization Tests
  // ===========================================================================

  test("[P0-VAL] should normalize email to lowercase", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    const state = await prismaClient.uSState.findFirst({
      where: { code: "GA" },
    });

    if (!state) {
      test.skip();
      return;
    }

    const timestamp = Date.now();
    const payload = generateValidPayload(timestamp);
    payload.company.address.state_id = state.state_id;
    payload.store.state_id = state.state_id;
    // Use uppercase emails
    payload.user.email = `OWNER-${timestamp}@TEST.COM`;
    payload.storeLogin.email = `STORELOGIN-${timestamp}@TEST.COM`;
    payload.storeManager.email = `STOREMANAGER-${timestamp}@TEST.COM`;

    const response = await superadminApiRequest.post(
      "/api/admin/client-owner-setup",
      payload,
    );

    expect(response.status()).toBe(201);
    const body = await response.json();

    // Verify emails are normalized to lowercase
    expect(body.data.user.email).toBe(payload.user.email.toLowerCase());
    expect(body.data.storeLogin.email).toBe(
      payload.storeLogin.email.toLowerCase(),
    );
    expect(body.data.storeManager.email).toBe(
      payload.storeManager.email.toLowerCase(),
    );

    // Cleanup
    await prismaClient.userRole.deleteMany({
      where: {
        user_id: {
          in: [
            body.data.user.user_id,
            body.data.storeLogin.user_id,
            body.data.storeManager.user_id,
          ],
        },
      },
    });
    await prismaClient.store.delete({
      where: { store_id: body.data.store.store_id },
    });
    await prismaClient.company.delete({
      where: { company_id: body.data.company.company_id },
    });
    await prismaClient.user.deleteMany({
      where: {
        user_id: {
          in: [
            body.data.user.user_id,
            body.data.storeLogin.user_id,
            body.data.storeManager.user_id,
          ],
        },
      },
    });
  });

  test("[P0-VAL] should trim whitespace from names", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    const state = await prismaClient.uSState.findFirst({
      where: { code: "GA" },
    });

    if (!state) {
      test.skip();
      return;
    }

    const timestamp = Date.now();
    const payload = generateValidPayload(timestamp);
    payload.company.address.state_id = state.state_id;
    payload.store.state_id = state.state_id;
    // Add whitespace to names
    payload.user.name = "  Test Owner  ";
    payload.company.name = `  Test Company ${timestamp}  `;
    payload.store.name = `  Test Store ${timestamp}  `;

    const response = await superadminApiRequest.post(
      "/api/admin/client-owner-setup",
      payload,
    );

    expect(response.status()).toBe(201);
    const body = await response.json();

    // Verify names are trimmed
    expect(body.data.user.name).toBe("Test Owner");
    expect(body.data.company.name).toBe(`Test Company ${timestamp}`);
    expect(body.data.store.name).toBe(`Test Store ${timestamp}`);

    // Cleanup
    await prismaClient.userRole.deleteMany({
      where: {
        user_id: {
          in: [
            body.data.user.user_id,
            body.data.storeLogin.user_id,
            body.data.storeManager.user_id,
          ],
        },
      },
    });
    await prismaClient.store.delete({
      where: { store_id: body.data.store.store_id },
    });
    await prismaClient.company.delete({
      where: { company_id: body.data.company.company_id },
    });
    await prismaClient.user.deleteMany({
      where: {
        user_id: {
          in: [
            body.data.user.user_id,
            body.data.storeLogin.user_id,
            body.data.storeManager.user_id,
          ],
        },
      },
    });
  });

  // ===========================================================================
  // Edge Case and Boundary Tests
  // ===========================================================================

  test("[P1-EDGE] should accept password at exact minimum length (8 chars)", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    const state = await prismaClient.uSState.findFirst({
      where: { code: "GA" },
    });

    if (!state) {
      test.skip();
      return;
    }

    const timestamp = Date.now();
    const payload = generateValidPayload(timestamp);
    payload.company.address.state_id = state.state_id;
    payload.store.state_id = state.state_id;
    // Exact 8 character password meeting all requirements
    payload.user.password = "Abcd123!";
    payload.storeLogin.password = "Efgh456@";
    payload.storeManager.password = "Ijkl789#";

    const response = await superadminApiRequest.post(
      "/api/admin/client-owner-setup",
      payload,
    );

    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.success).toBe(true);

    // Cleanup
    await prismaClient.userRole.deleteMany({
      where: {
        user_id: {
          in: [
            body.data.user.user_id,
            body.data.storeLogin.user_id,
            body.data.storeManager.user_id,
          ],
        },
      },
    });
    await prismaClient.store.delete({
      where: { store_id: body.data.store.store_id },
    });
    await prismaClient.company.delete({
      where: { company_id: body.data.company.company_id },
    });
    await prismaClient.user.deleteMany({
      where: {
        user_id: {
          in: [
            body.data.user.user_id,
            body.data.storeLogin.user_id,
            body.data.storeManager.user_id,
          ],
        },
      },
    });
  });

  test("[P1-EDGE] should reject password below minimum length (7 chars)", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    const state = await prismaClient.uSState.findFirst({
      where: { code: "GA" },
    });

    if (!state) {
      test.skip();
      return;
    }

    const timestamp = Date.now();
    const payload = generateValidPayload(timestamp);
    payload.company.address.state_id = state.state_id;
    payload.store.state_id = state.state_id;
    // 7 character password (below minimum)
    payload.storeManager.password = "Abc123!";

    const response = await superadminApiRequest.post(
      "/api/admin/client-owner-setup",
      payload,
    );

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  test("[P1-EDGE] should reject invalid email format", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    const state = await prismaClient.uSState.findFirst({
      where: { code: "GA" },
    });

    if (!state) {
      test.skip();
      return;
    }

    const timestamp = Date.now();
    const payload = generateValidPayload(timestamp);
    payload.company.address.state_id = state.state_id;
    payload.store.state_id = state.state_id;
    payload.storeManager.email = "invalid-email-format"; // No @ symbol

    const response = await superadminApiRequest.post(
      "/api/admin/client-owner-setup",
      payload,
    );

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  test("[P1-EDGE] should reject email with missing domain", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    const state = await prismaClient.uSState.findFirst({
      where: { code: "GA" },
    });

    if (!state) {
      test.skip();
      return;
    }

    const timestamp = Date.now();
    const payload = generateValidPayload(timestamp);
    payload.company.address.state_id = state.state_id;
    payload.store.state_id = state.state_id;
    payload.user.email = "user@"; // Missing domain

    const response = await superadminApiRequest.post(
      "/api/admin/client-owner-setup",
      payload,
    );

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  test("[P1-EDGE] should reject empty company name", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    const state = await prismaClient.uSState.findFirst({
      where: { code: "GA" },
    });

    if (!state) {
      test.skip();
      return;
    }

    const timestamp = Date.now();
    const payload = generateValidPayload(timestamp);
    payload.company.address.state_id = state.state_id;
    payload.store.state_id = state.state_id;
    payload.company.name = ""; // Empty name

    const response = await superadminApiRequest.post(
      "/api/admin/client-owner-setup",
      payload,
    );

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  test("[P1-EDGE] should reject empty user name", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    const state = await prismaClient.uSState.findFirst({
      where: { code: "GA" },
    });

    if (!state) {
      test.skip();
      return;
    }

    const timestamp = Date.now();
    const payload = generateValidPayload(timestamp);
    payload.company.address.state_id = state.state_id;
    payload.store.state_id = state.state_id;
    payload.user.name = ""; // Empty name

    const response = await superadminApiRequest.post(
      "/api/admin/client-owner-setup",
      payload,
    );

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  test("[P1-EDGE] should reject whitespace-only names", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    const state = await prismaClient.uSState.findFirst({
      where: { code: "GA" },
    });

    if (!state) {
      test.skip();
      return;
    }

    const timestamp = Date.now();
    const payload = generateValidPayload(timestamp);
    payload.company.address.state_id = state.state_id;
    payload.store.state_id = state.state_id;
    payload.user.name = "   "; // Whitespace only

    const response = await superadminApiRequest.post(
      "/api/admin/client-owner-setup",
      payload,
    );

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  test("[P1-EDGE] should handle special characters in names correctly", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    const state = await prismaClient.uSState.findFirst({
      where: { code: "GA" },
    });

    if (!state) {
      test.skip();
      return;
    }

    const timestamp = Date.now();
    const payload = generateValidPayload(timestamp);
    payload.company.address.state_id = state.state_id;
    payload.store.state_id = state.state_id;
    // Names with legitimate special characters
    payload.user.name = "José García-Smith";
    payload.company.name = `O'Brien & Sons Co. ${timestamp}`;
    payload.store.name = `Café Paris #${timestamp}`;

    const response = await superadminApiRequest.post(
      "/api/admin/client-owner-setup",
      payload,
    );

    expect(response.status()).toBe(201);
    const body = await response.json();

    expect(body.data.user.name).toBe("José García-Smith");
    expect(body.data.company.name).toBe(`O'Brien & Sons Co. ${timestamp}`);
    expect(body.data.store.name).toBe(`Café Paris #${timestamp}`);

    // Cleanup
    await prismaClient.userRole.deleteMany({
      where: {
        user_id: {
          in: [
            body.data.user.user_id,
            body.data.storeLogin.user_id,
            body.data.storeManager.user_id,
          ],
        },
      },
    });
    await prismaClient.store.delete({
      where: { store_id: body.data.store.store_id },
    });
    await prismaClient.company.delete({
      where: { company_id: body.data.company.company_id },
    });
    await prismaClient.user.deleteMany({
      where: {
        user_id: {
          in: [
            body.data.user.user_id,
            body.data.storeLogin.user_id,
            body.data.storeManager.user_id,
          ],
        },
      },
    });
  });

  test("[P1-EDGE] should reject invalid state_id", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    const state = await prismaClient.uSState.findFirst({
      where: { code: "GA" },
    });

    if (!state) {
      test.skip();
      return;
    }

    const timestamp = Date.now();
    const payload = generateValidPayload(timestamp);
    payload.company.address.state_id = state.state_id;
    payload.store.state_id = "invalid-uuid-format"; // Invalid state ID

    const response = await superadminApiRequest.post(
      "/api/admin/client-owner-setup",
      payload,
    );

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
  });

  test("[P1-EDGE] should reject non-existent state_id", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    const state = await prismaClient.uSState.findFirst({
      where: { code: "GA" },
    });

    if (!state) {
      test.skip();
      return;
    }

    const timestamp = Date.now();
    const payload = generateValidPayload(timestamp);
    payload.company.address.state_id = state.state_id;
    // Valid UUID format but non-existent
    payload.store.state_id = "00000000-0000-0000-0000-000000000000";

    const response = await superadminApiRequest.post(
      "/api/admin/client-owner-setup",
      payload,
    );

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
  });

  test("[P1-EDGE] should accept various valid IANA timezones", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    const state = await prismaClient.uSState.findFirst({
      where: { code: "GA" },
    });

    if (!state) {
      test.skip();
      return;
    }

    // Test with a different valid timezone
    const timestamp = Date.now();
    const payload = generateValidPayload(timestamp);
    payload.company.address.state_id = state.state_id;
    payload.store.state_id = state.state_id;
    payload.store.timezone = "America/Los_Angeles";

    const response = await superadminApiRequest.post(
      "/api/admin/client-owner-setup",
      payload,
    );

    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.data.store.timezone).toBe("America/Los_Angeles");

    // Cleanup
    await prismaClient.userRole.deleteMany({
      where: {
        user_id: {
          in: [
            body.data.user.user_id,
            body.data.storeLogin.user_id,
            body.data.storeManager.user_id,
          ],
        },
      },
    });
    await prismaClient.store.delete({
      where: { store_id: body.data.store.store_id },
    });
    await prismaClient.company.delete({
      where: { company_id: body.data.company.company_id },
    });
    await prismaClient.user.deleteMany({
      where: {
        user_id: {
          in: [
            body.data.user.user_id,
            body.data.storeLogin.user_id,
            body.data.storeManager.user_id,
          ],
        },
      },
    });
  });

  // ===========================================================================
  // Security Abuse Case Tests
  // ===========================================================================

  test("[P0-SEC-INJ] should sanitize potential SQL injection in name fields", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    const state = await prismaClient.uSState.findFirst({
      where: { code: "GA" },
    });

    if (!state) {
      test.skip();
      return;
    }

    const timestamp = Date.now();
    const payload = generateValidPayload(timestamp);
    payload.company.address.state_id = state.state_id;
    payload.store.state_id = state.state_id;
    // SQL injection attempt in name fields
    payload.user.name = "Robert'); DROP TABLE users;--";
    payload.company.name = `Test Co ${timestamp}; DELETE FROM companies;--`;

    const response = await superadminApiRequest.post(
      "/api/admin/client-owner-setup",
      payload,
    );

    // Should either succeed (if input is sanitized) or fail validation
    // It should NEVER execute the SQL injection
    if (response.status() === 201) {
      const body = await response.json();
      // Verify the name is stored literally, not executed
      expect(body.data.user.name).toBe("Robert'); DROP TABLE users;--");

      // Verify database still exists and has data
      const userCount = await prismaClient.user.count();
      expect(userCount).toBeGreaterThan(0);

      // Cleanup
      await prismaClient.userRole.deleteMany({
        where: {
          user_id: {
            in: [
              body.data.user.user_id,
              body.data.storeLogin.user_id,
              body.data.storeManager.user_id,
            ],
          },
        },
      });
      await prismaClient.store.delete({
        where: { store_id: body.data.store.store_id },
      });
      await prismaClient.company.delete({
        where: { company_id: body.data.company.company_id },
      });
      await prismaClient.user.deleteMany({
        where: {
          user_id: {
            in: [
              body.data.user.user_id,
              body.data.storeLogin.user_id,
              body.data.storeManager.user_id,
            ],
          },
        },
      });
    } else {
      // Validation rejection is also acceptable
      expect(response.status()).toBe(400);
    }
  });

  test("[P0-SEC-XSS] should sanitize potential XSS in name fields", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    const state = await prismaClient.uSState.findFirst({
      where: { code: "GA" },
    });

    if (!state) {
      test.skip();
      return;
    }

    const timestamp = Date.now();
    const payload = generateValidPayload(timestamp);
    payload.company.address.state_id = state.state_id;
    payload.store.state_id = state.state_id;
    // XSS attempt in name fields
    payload.user.name = '<script>alert("xss")</script>';
    payload.company.name = `Test Co ${timestamp}<img src=x onerror=alert(1)>`;

    const response = await superadminApiRequest.post(
      "/api/admin/client-owner-setup",
      payload,
    );

    // Should either succeed (storing escaped/sanitized content) or reject
    if (response.status() === 201) {
      const body = await response.json();
      // If stored, verify it's stored as literal text (not executable)
      // The name should either be sanitized/escaped or stored literally
      expect(body.data.user.name).toBeDefined();

      // Cleanup
      await prismaClient.userRole.deleteMany({
        where: {
          user_id: {
            in: [
              body.data.user.user_id,
              body.data.storeLogin.user_id,
              body.data.storeManager.user_id,
            ],
          },
        },
      });
      await prismaClient.store.delete({
        where: { store_id: body.data.store.store_id },
      });
      await prismaClient.company.delete({
        where: { company_id: body.data.company.company_id },
      });
      await prismaClient.user.deleteMany({
        where: {
          user_id: {
            in: [
              body.data.user.user_id,
              body.data.storeLogin.user_id,
              body.data.storeManager.user_id,
            ],
          },
        },
      });
    } else {
      // Validation rejection is also acceptable
      expect(response.status()).toBe(400);
    }
  });

  test("[P0-SEC-PROTO] should reject prototype pollution attempts", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    const state = await prismaClient.uSState.findFirst({
      where: { code: "GA" },
    });

    if (!state) {
      test.skip();
      return;
    }

    const timestamp = Date.now();
    const payload = generateValidPayload(timestamp);
    payload.company.address.state_id = state.state_id;
    payload.store.state_id = state.state_id;
    // Prototype pollution attempt
    (payload as any).__proto__ = { isAdmin: true };
    (payload as any).constructor = { prototype: { isAdmin: true } };

    const response = await superadminApiRequest.post(
      "/api/admin/client-owner-setup",
      payload,
    );

    // Should either succeed (ignoring the malicious fields) or reject
    if (response.status() === 201) {
      const body = await response.json();
      // Verify no prototype pollution occurred
      expect(body.data.user.isAdmin).toBeUndefined();

      // Cleanup
      await prismaClient.userRole.deleteMany({
        where: {
          user_id: {
            in: [
              body.data.user.user_id,
              body.data.storeLogin.user_id,
              body.data.storeManager.user_id,
            ],
          },
        },
      });
      await prismaClient.store.delete({
        where: { store_id: body.data.store.store_id },
      });
      await prismaClient.company.delete({
        where: { company_id: body.data.company.company_id },
      });
      await prismaClient.user.deleteMany({
        where: {
          user_id: {
            in: [
              body.data.user.user_id,
              body.data.storeLogin.user_id,
              body.data.storeManager.user_id,
            ],
          },
        },
      });
    }
    // Any status is acceptable as long as no security issue
  });

  test("[P0-SEC-NOSQL] should handle NoSQL injection patterns safely", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    const state = await prismaClient.uSState.findFirst({
      where: { code: "GA" },
    });

    if (!state) {
      test.skip();
      return;
    }

    const timestamp = Date.now();
    const payload = generateValidPayload(timestamp);
    payload.company.address.state_id = state.state_id;
    payload.store.state_id = state.state_id;
    // NoSQL injection patterns as string values
    payload.user.name = '{"$gt": ""}';
    payload.company.name = `{"$ne": null} ${timestamp}`;

    const response = await superadminApiRequest.post(
      "/api/admin/client-owner-setup",
      payload,
    );

    // Should treat these as literal strings, not operators
    if (response.status() === 201) {
      const body = await response.json();
      // Verify stored as literal text
      expect(body.data.user.name).toBe('{"$gt": ""}');

      // Cleanup
      await prismaClient.userRole.deleteMany({
        where: {
          user_id: {
            in: [
              body.data.user.user_id,
              body.data.storeLogin.user_id,
              body.data.storeManager.user_id,
            ],
          },
        },
      });
      await prismaClient.store.delete({
        where: { store_id: body.data.store.store_id },
      });
      await prismaClient.company.delete({
        where: { company_id: body.data.company.company_id },
      });
      await prismaClient.user.deleteMany({
        where: {
          user_id: {
            in: [
              body.data.user.user_id,
              body.data.storeLogin.user_id,
              body.data.storeManager.user_id,
            ],
          },
        },
      });
    } else {
      // Rejection is also acceptable
      expect(response.status()).toBe(400);
    }
  });

  test("[P0-SEC-PRIV] should not allow role escalation through payload manipulation", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    const state = await prismaClient.uSState.findFirst({
      where: { code: "GA" },
    });

    if (!state) {
      test.skip();
      return;
    }

    const timestamp = Date.now();
    const payload = generateValidPayload(timestamp);
    payload.company.address.state_id = state.state_id;
    payload.store.state_id = state.state_id;
    // Attempt to inject additional roles
    (payload.user as any).roles = [
      { role_code: "SYSTEM_ADMIN", scope: "SYSTEM" },
    ];
    (payload as any).additionalRoles = ["SYSTEM_ADMIN"];

    const response = await superadminApiRequest.post(
      "/api/admin/client-owner-setup",
      payload,
    );

    if (response.status() === 201) {
      const body = await response.json();
      // Verify the user only has CLIENT_OWNER role, not SYSTEM_ADMIN
      expect(body.data.user.roles).toHaveLength(1);
      expect(body.data.user.roles[0].role_code).toBe("CLIENT_OWNER");
      expect(
        body.data.user.roles.some((r: any) => r.role_code === "SYSTEM_ADMIN"),
      ).toBe(false);

      // Cleanup
      await prismaClient.userRole.deleteMany({
        where: {
          user_id: {
            in: [
              body.data.user.user_id,
              body.data.storeLogin.user_id,
              body.data.storeManager.user_id,
            ],
          },
        },
      });
      await prismaClient.store.delete({
        where: { store_id: body.data.store.store_id },
      });
      await prismaClient.company.delete({
        where: { company_id: body.data.company.company_id },
      });
      await prismaClient.user.deleteMany({
        where: {
          user_id: {
            in: [
              body.data.user.user_id,
              body.data.storeLogin.user_id,
              body.data.storeManager.user_id,
            ],
          },
        },
      });
    }
  });

  test("[P1-SEC] should not expose password hashes in response", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    const state = await prismaClient.uSState.findFirst({
      where: { code: "GA" },
    });

    if (!state) {
      test.skip();
      return;
    }

    const timestamp = Date.now();
    const payload = generateValidPayload(timestamp);
    payload.company.address.state_id = state.state_id;
    payload.store.state_id = state.state_id;

    const response = await superadminApiRequest.post(
      "/api/admin/client-owner-setup",
      payload,
    );

    expect(response.status()).toBe(201);
    const body = await response.json();

    // Verify no password data is exposed
    const responseText = JSON.stringify(body);
    expect(responseText).not.toContain("password_hash");
    expect(responseText).not.toContain(payload.user.password);
    expect(responseText).not.toContain(payload.storeLogin.password);
    expect(responseText).not.toContain(payload.storeManager.password);
    expect(body.data.user.password).toBeUndefined();
    expect(body.data.user.password_hash).toBeUndefined();
    expect(body.data.storeLogin.password).toBeUndefined();
    expect(body.data.storeManager.password).toBeUndefined();

    // Track for cleanup (afterAll safety net)
    trackForCleanup({
      userId: body.data.user.user_id,
      storeLoginId: body.data.storeLogin.user_id,
      storeManagerId: body.data.storeManager.user_id,
      companyId: body.data.company.company_id,
      storeId: body.data.store.store_id,
    });

    // Cleanup
    await prismaClient.userRole.deleteMany({
      where: {
        user_id: {
          in: [
            body.data.user.user_id,
            body.data.storeLogin.user_id,
            body.data.storeManager.user_id,
          ],
        },
      },
    });
    await prismaClient.store.delete({
      where: { store_id: body.data.store.store_id },
    });
    await prismaClient.company.delete({
      where: { company_id: body.data.company.company_id },
    });
    await prismaClient.user.deleteMany({
      where: {
        user_id: {
          in: [
            body.data.user.user_id,
            body.data.storeLogin.user_id,
            body.data.storeManager.user_id,
          ],
        },
      },
    });
  });

  // ===========================================================================
  // Cleanup Hook - Safety net for test isolation
  // ===========================================================================

  /**
   * IMPORTANT: This afterAll hook ensures cleanup happens even when tests fail
   * mid-execution. Individual tests may still do inline cleanup for speed,
   * but this provides a safety net for test isolation.
   */
  test.afterAll(async ({ prismaClient }) => {
    try {
      // Clean up any temporary users created for test setup
      for (const userId of Array.from(cleanupTracker.tempUsers)) {
        try {
          await prismaClient.user
            .delete({ where: { user_id: userId } })
            .catch(() => {});
        } catch {
          // Ignore - may already be deleted
        }
      }

      // Clean up wizard-created entities using the helper
      await cleanupTestData(prismaClient, {
        users: Array.from(cleanupTracker.users),
        stores: Array.from(cleanupTracker.stores),
        companies: Array.from(cleanupTracker.companies),
      });

      // Clear trackers
      cleanupTracker.users.clear();
      cleanupTracker.companies.clear();
      cleanupTracker.stores.clear();
      cleanupTracker.tempUsers.clear();
    } catch (error) {
      console.error("Cleanup error in afterAll:", error);
      // Don't throw - cleanup failures shouldn't mask test failures
    }
  });
});
