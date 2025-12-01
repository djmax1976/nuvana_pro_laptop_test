/**
 * @test-level API
 * @justification Endpoint integration tests verifying HTTP layer, authentication, authorization, request/response format, and error handling for cashier shift start flow
 * @story 4-8-cashier-shift-start-flow
 *
 * Cashier Shift Start API Tests - Story 4.8
 *
 * STORY: As a Cashier, I want to start my own shift by selecting an available POS terminal,
 * so that I can begin my workday without requiring manager intervention.
 *
 * TEST LEVEL: API (endpoint integration tests)
 * PRIMARY GOAL: Verify GET /api/stores/:storeId/terminals, POST /api/shifts/open (auto-assignment), and GET /api/shifts (RLS filtering)
 *
 * BUSINESS RULES TESTED:
 * - Terminal availability checking (no active shifts)
 * - Auto-assignment of cashier_id when not provided
 * - Backward compatibility with provided cashier_id
 * - RLS filtering for cashier shift list (cashier_id = user.id)
 * - Authentication required (JWT token)
 * - Authorization required (SHIFT_OPEN permission)
 * - Multi-tenant isolation (store_id must be accessible to user)
 */

import { test, expect } from "../support/fixtures/rbac.fixture";
import {
  createUser,
  createCompany,
  createStore,
  createShift,
  createTerminal,
  createJWTAccessToken,
} from "../support/factories";

// =============================================================================
// SECTION 1: P0 CRITICAL - GET /api/stores/:storeId/terminals TESTS
// =============================================================================

test.describe("4.8-API: Store Terminals Endpoint", () => {
  test("4.8-API-001: [P1] should return terminals with has_active_shift flag", async ({
    authenticatedApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A store with terminals (some with active shifts)
    const user = await prismaClient.user.create({
      data: createUser(),
    });
    const company = await prismaClient.company.create({
      data: createCompany({ owner_user_id: user.user_id }),
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

    // Create active shift for terminal1
    await prismaClient.shift.create({
      data: createShift({
        store_id: store.store_id,
        opened_by: user.user_id,
        cashier_id: user.user_id,
        pos_terminal_id: terminal1.pos_terminal_id,
        status: "OPEN",
      }),
    });

    // WHEN: Requesting terminals for the store
    const response = await authenticatedApiRequest.get(
      `/api/stores/${store.store_id}/terminals`,
    );

    // THEN: Should return terminals with has_active_shift flag (array directly)
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body)).toBe(true);

    const terminal1Data = body.find(
      (t: any) => t.pos_terminal_id === terminal1.pos_terminal_id,
    );
    expect(terminal1Data.has_active_shift).toBe(true);

    const terminal2Data = body.find(
      (t: any) => t.pos_terminal_id === terminal2.pos_terminal_id,
    );
    expect(terminal2Data.has_active_shift).toBe(false);
  });

  test("4.8-API-002: [P1] should return empty array when no terminals exist", async ({
    authenticatedApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A store with no terminals
    const user = await prismaClient.user.create({
      data: createUser(),
    });
    const company = await prismaClient.company.create({
      data: createCompany({ owner_user_id: user.user_id }),
    });
    const store = await prismaClient.store.create({
      data: createStore({ company_id: company.company_id }),
    });

    // WHEN: Requesting terminals for the store
    const response = await authenticatedApiRequest.get(
      `/api/stores/${store.store_id}/terminals`,
    );

    // THEN: Should return empty array (array directly)
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toEqual([]);
  });

  test("4.8-API-003: [P1] should enforce RLS filtering (user can only access terminals for accessible stores)", async ({
    authenticatedApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A store that the user cannot access
    const otherUser = await prismaClient.user.create({
      data: createUser(),
    });
    const otherCompany = await prismaClient.company.create({
      data: createCompany({ owner_user_id: otherUser.user_id }),
    });
    const otherStore = await prismaClient.store.create({
      data: createStore({ company_id: otherCompany.company_id }),
    });

    // WHEN: Requesting terminals for inaccessible store
    const response = await authenticatedApiRequest.get(
      `/api/stores/${otherStore.store_id}/terminals`,
    );

    // THEN: Should return 403 or empty array (depending on RLS implementation)
    expect([403, 404, 200]).toContain(response.status());
    if (response.status() === 200) {
      const body = await response.json();
      expect(Array.isArray(body)).toBe(true);
      expect(body).toEqual([]);
    }
  });
});

// =============================================================================
// SECTION 2: P0 CRITICAL - POST /api/shifts/open AUTO-ASSIGNMENT TESTS
// =============================================================================

test.describe("4.8-API: Shift Opening Auto-Assignment", () => {
  test("4.8-API-004: [P0] should auto-assign cashier_id when not provided", async ({
    apiRequest,
    prismaClient,
  }) => {
    // GIVEN: A store with terminal and authenticated cashier with proper role assignment
    const cashier = await prismaClient.user.create({
      data: createUser(),
    });
    const company = await prismaClient.company.create({
      data: createCompany({ owner_user_id: cashier.user_id }),
    });
    const store = await prismaClient.store.create({
      data: createStore({ company_id: company.company_id }),
    });
    const terminal = await prismaClient.pOSTerminal.create({
      data: createTerminal({ store_id: store.store_id }),
    });

    // Assign CASHIER role to the user at the store level
    const cashierRole = await prismaClient.role.findFirst({
      where: { code: "CASHIER" },
    });
    if (!cashierRole) {
      throw new Error("CASHIER role not found in database");
    }
    await prismaClient.userRole.create({
      data: {
        user_id: cashier.user_id,
        role_id: cashierRole.role_id,
        store_id: store.store_id,
        company_id: company.company_id,
      },
    });

    // Create JWT token for the cashier user with SHIFT_OPEN permission
    const cashierToken = createJWTAccessToken({
      user_id: cashier.user_id,
      email: cashier.email,
      permissions: ["SHIFT_OPEN"],
    });

    // WHEN: Opening shift without cashier_id (using cashier's token)
    const response = await apiRequest.post(
      "/api/shifts/open",
      {
        store_id: store.store_id,
        pos_terminal_id: terminal.pos_terminal_id,
        opening_cash: 100.0,
        // cashier_id is NOT provided - should be auto-assigned to authenticated user
      },
      {
        headers: {
          Cookie: `access_token=${cashierToken}`,
        },
      },
    );

    // THEN: Shift should be created with cashier_id = authenticated user (the cashier)
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.cashier_id).toBe(cashier.user_id);
  });

  test("4.8-API-005: [P0] should use provided cashier_id when present (backward compatibility)", async ({
    authenticatedApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A store with terminal, authenticated manager, and cashier
    const manager = await prismaClient.user.create({
      data: createUser(),
    });
    const cashier = await prismaClient.user.create({
      data: createUser(),
    });
    const company = await prismaClient.company.create({
      data: createCompany({ owner_user_id: manager.user_id }),
    });
    const store = await prismaClient.store.create({
      data: createStore({ company_id: company.company_id }),
    });
    const terminal = await prismaClient.pOSTerminal.create({
      data: createTerminal({ store_id: store.store_id }),
    });

    // WHEN: Opening shift with cashier_id provided (manager flow)
    const response = await authenticatedApiRequest.post("/api/shifts/open", {
      store_id: store.store_id,
      cashier_id: cashier.user_id, // cashier_id IS provided
      pos_terminal_id: terminal.pos_terminal_id,
      opening_cash: 100.0,
    });

    // THEN: Shift should be created with provided cashier_id
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.cashier_id).toBe(cashier.user_id);
  });
});

// =============================================================================
// SECTION 3: P0 CRITICAL - GET /api/shifts RLS FILTERING TESTS
// =============================================================================

test.describe("4.8-API: Shift List RLS Filtering", () => {
  test("4.8-API-006: [P0] should filter shifts by cashier_id for CASHIER role users", async ({
    apiRequest,
    prismaClient,
  }) => {
    // GIVEN: Multiple cashiers with shifts
    const cashier1 = await prismaClient.user.create({
      data: createUser(),
    });
    const cashier2 = await prismaClient.user.create({
      data: createUser(),
    });
    const company = await prismaClient.company.create({
      data: createCompany({ owner_user_id: cashier1.user_id }),
    });
    const store = await prismaClient.store.create({
      data: createStore({ company_id: company.company_id }),
    });

    // Assign CASHIER role to cashier1 at the store level
    const cashierRole = await prismaClient.role.findFirst({
      where: { code: "CASHIER" },
    });
    if (!cashierRole) {
      throw new Error("CASHIER role not found in database");
    }
    await prismaClient.userRole.create({
      data: {
        user_id: cashier1.user_id,
        role_id: cashierRole.role_id,
        store_id: store.store_id,
        company_id: company.company_id,
      },
    });

    // Create shifts for both cashiers
    await prismaClient.shift.create({
      data: createShift({
        store_id: store.store_id,
        opened_by: cashier1.user_id,
        cashier_id: cashier1.user_id,
        status: "OPEN",
      }),
    });
    await prismaClient.shift.create({
      data: createShift({
        store_id: store.store_id,
        opened_by: cashier2.user_id,
        cashier_id: cashier2.user_id,
        status: "OPEN",
      }),
    });

    // Create JWT token for cashier1 with CASHIER role (triggers RLS filtering by cashier_id)
    const cashier1Token = createJWTAccessToken({
      user_id: cashier1.user_id,
      email: cashier1.email,
      roles: ["CASHIER"],
      permissions: ["SHIFT_READ"],
    });

    // WHEN: Cashier1 requests shift list (using cashier1's token)
    const response = await apiRequest.get("/api/shifts", {
      headers: {
        Cookie: `access_token=${cashier1Token}`,
      },
    });

    // THEN: Should only return cashier1's shifts (RLS filters by cashier_id for CASHIER role)
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.shifts).toBeInstanceOf(Array);
    // All returned shifts should have cashier_id = cashier1.user_id
    body.data.shifts.forEach((shift: any) => {
      expect(shift.cashier_id).toBe(cashier1.user_id);
    });
  });

  test("4.8-API-007: [P0] should use store-based RLS for non-CASHIER users", async ({
    authenticatedApiRequest,
    prismaClient,
  }) => {
    // GIVEN: Store manager with shifts from multiple cashiers
    const manager = await prismaClient.user.create({
      data: createUser(),
    });
    const cashier1 = await prismaClient.user.create({
      data: createUser(),
    });
    const cashier2 = await prismaClient.user.create({
      data: createUser(),
    });
    const company = await prismaClient.company.create({
      data: createCompany({ owner_user_id: manager.user_id }),
    });
    const store = await prismaClient.store.create({
      data: createStore({ company_id: company.company_id }),
    });

    // Create shifts for both cashiers
    await prismaClient.shift.create({
      data: createShift({
        store_id: store.store_id,
        opened_by: manager.user_id,
        cashier_id: cashier1.user_id,
        status: "OPEN",
      }),
    });
    await prismaClient.shift.create({
      data: createShift({
        store_id: store.store_id,
        opened_by: manager.user_id,
        cashier_id: cashier2.user_id,
        status: "OPEN",
      }),
    });

    // WHEN: Store manager requests shift list
    // (Note: This requires authenticatedApiRequest to use manager's token with STORE_MANAGER role)
    const response = await authenticatedApiRequest.get("/api/shifts");

    // THEN: Should return all shifts for accessible stores (not filtered by cashier_id)
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.shifts).toBeInstanceOf(Array);
    // Should include shifts from both cashiers (store-based filtering)
    const cashierIds = body.data.shifts.map((s: any) => s.cashier_id);
    expect(cashierIds).toContain(cashier1.user_id);
    expect(cashierIds).toContain(cashier2.user_id);
  });
});

// =============================================================================
// SECTION 4: P0 CRITICAL - PERMISSION CHECKS
// =============================================================================

test.describe("4.8-API: Permission Checks", () => {
  test("4.8-API-008: [P0] should return 403 when user lacks SHIFT_OPEN permission", async ({
    apiRequest,
    prismaClient,
  }) => {
    // GIVEN: A user without SHIFT_OPEN permission
    const userWithoutPermission = await prismaClient.user.create({
      data: createUser(),
    });
    // Create a role without SHIFT_OPEN permission
    const role = await prismaClient.role.create({
      data: {
        scope: "STORE",
        code: `TEST_ROLE_${Date.now()}`,
        description: "Test role without SHIFT_OPEN",
      },
    });
    await prismaClient.userRole.create({
      data: {
        user_id: userWithoutPermission.user_id,
        role_id: role.role_id,
      },
    });

    const company = await prismaClient.company.create({
      data: createCompany({ owner_user_id: userWithoutPermission.user_id }),
    });
    const store = await prismaClient.store.create({
      data: createStore({ company_id: company.company_id }),
    });
    const terminal = await prismaClient.pOSTerminal.create({
      data: createTerminal({ store_id: store.store_id }),
    });

    // Create JWT token for user without permission
    const token = createJWTAccessToken({
      user_id: userWithoutPermission.user_id,
      email: userWithoutPermission.email,
      permissions: [], // No SHIFT_OPEN permission
    });

    // WHEN: User without SHIFT_OPEN permission tries to open shift
    const response = await apiRequest.post(
      "/api/shifts/open",
      {
        store_id: store.store_id,
        pos_terminal_id: terminal.pos_terminal_id,
        opening_cash: 100.0,
        // cashier_id not provided (auto-assignment)
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );

    // THEN: Should return 403 Forbidden
    expect(response.status()).toBe(403);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("PERMISSION_DENIED");
  });
});

// =============================================================================
// SECTION 5: P1 IMPORTANT - AUDIT LOGGING
// =============================================================================

test.describe("4.8-API: Audit Logging", () => {
  test("4.8-API-009: [P1] should create audit log entry for cashier self-service shift opening", async ({
    authenticatedApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A store with terminal and authenticated cashier
    const cashier = await prismaClient.user.create({
      data: createUser(),
    });
    const company = await prismaClient.company.create({
      data: createCompany({ owner_user_id: cashier.user_id }),
    });
    const store = await prismaClient.store.create({
      data: createStore({ company_id: company.company_id }),
    });
    const terminal = await prismaClient.pOSTerminal.create({
      data: createTerminal({ store_id: store.store_id }),
    });

    // WHEN: Cashier opens shift without providing cashier_id (self-service)
    const response = await authenticatedApiRequest.post("/api/shifts/open", {
      store_id: store.store_id,
      pos_terminal_id: terminal.pos_terminal_id,
      opening_cash: 100.0,
      // cashier_id is NOT provided (auto-assigned)
    });

    // THEN: Shift should be created
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.success).toBe(true);
    const shiftId = body.data.shift_id;

    // AND: Audit log entry should exist for shift opening
    const auditLogs = await prismaClient.auditLog.findMany({
      where: {
        table_name: "shifts",
        record_id: shiftId,
        action: "SHIFT_OPENED",
      },
    });

    expect(auditLogs.length).toBeGreaterThan(0);
    const shiftAuditLog = auditLogs.find(
      (log) => log.record_id === shiftId && log.action === "SHIFT_OPENED",
    );
    expect(shiftAuditLog).toBeDefined();
    expect(shiftAuditLog?.user_id).toBe(cashier.user_id);
    // Check new_values JSON field for shift data
    const newValues = shiftAuditLog?.new_values as Record<
      string,
      unknown
    > | null;
    expect(newValues).toBeDefined();
    expect(newValues).toMatchObject({
      cashier_id: cashier.user_id,
      pos_terminal_id: terminal.pos_terminal_id,
      opening_cash: 100.0,
    });
  });
});

// =============================================================================
// SECTION 6: P0 CRITICAL - SECURITY TESTS (MANDATORY)
// =============================================================================

test.describe("4.8-API: Security Tests", () => {
  test("4.8-API-010: [P0] should reject requests with missing Authorization header", async ({
    apiRequest,
    prismaClient,
  }) => {
    // GIVEN: A valid shift opening request
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

    // WHEN: Making request without Authorization header
    const response = await apiRequest.post("/api/shifts/open", {
      store_id: store.store_id,
      pos_terminal_id: terminal.pos_terminal_id,
      opening_cash: 100.0,
    });

    // THEN: Should return 401 Unauthorized
    expect(response.status()).toBe(401);
  });

  test("4.8-API-011: [P0] should reject requests with invalid JWT token", async ({
    apiRequest,
    prismaClient,
  }) => {
    // GIVEN: A valid shift opening request
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

    // WHEN: Making request with invalid token
    const response = await apiRequest.post(
      "/api/shifts/open",
      {
        store_id: store.store_id,
        pos_terminal_id: terminal.pos_terminal_id,
        opening_cash: 100.0,
      },
      {
        headers: {
          Authorization: "Bearer invalid-token-format",
        },
      },
    );

    // THEN: Should return 401 Unauthorized
    expect(response.status()).toBe(401);
  });

  test("4.8-API-012: [P0] should reject invalid UUID format for store_id", async ({
    authenticatedApiRequest,
    prismaClient,
  }) => {
    // GIVEN: Invalid store_id format
    const terminal = await prismaClient.pOSTerminal.create({
      data: createTerminal({ store_id: "valid-uuid" }),
    });

    // WHEN: Opening shift with invalid store_id
    const response = await authenticatedApiRequest.post("/api/shifts/open", {
      store_id: "not-a-valid-uuid",
      pos_terminal_id: terminal.pos_terminal_id,
      opening_cash: 100.0,
    });

    // THEN: Should return 400 Bad Request
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
  });

  test("4.8-API-013: [P0] should reject invalid UUID format for pos_terminal_id", async ({
    authenticatedApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A store with invalid terminal ID format
    const user = await prismaClient.user.create({
      data: createUser(),
    });
    const company = await prismaClient.company.create({
      data: createCompany({ owner_user_id: user.user_id }),
    });
    const store = await prismaClient.store.create({
      data: createStore({ company_id: company.company_id }),
    });

    // WHEN: Opening shift with invalid pos_terminal_id
    const response = await authenticatedApiRequest.post("/api/shifts/open", {
      store_id: store.store_id,
      pos_terminal_id: "not-a-valid-uuid",
      opening_cash: 100.0,
    });

    // THEN: Should return 400 Bad Request
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
  });

  test("4.8-API-014: [P0] should reject negative opening_cash", async ({
    authenticatedApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A store with terminal
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

    // WHEN: Opening shift with negative opening_cash
    const response = await authenticatedApiRequest.post("/api/shifts/open", {
      store_id: store.store_id,
      pos_terminal_id: terminal.pos_terminal_id,
      opening_cash: -1,
    });

    // THEN: Should return 400 Bad Request
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
  });

  test("4.8-API-015: [P0] should reject opening_cash exceeding maximum (1000)", async ({
    authenticatedApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A store with terminal
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

    // WHEN: Opening shift with opening_cash > 1000
    const response = await authenticatedApiRequest.post("/api/shifts/open", {
      store_id: store.store_id,
      pos_terminal_id: terminal.pos_terminal_id,
      opening_cash: 1000.01,
    });

    // THEN: Should return 400 Bad Request
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.message).toMatch(/maximum|1000/i);
  });

  test("4.8-API-016: [P0] should accept opening_cash at maximum (1000)", async ({
    authenticatedApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A store with terminal
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

    // WHEN: Opening shift with opening_cash = 1000
    const response = await authenticatedApiRequest.post("/api/shifts/open", {
      store_id: store.store_id,
      pos_terminal_id: terminal.pos_terminal_id,
      opening_cash: 1000,
    });

    // THEN: Should return 201 Created
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.opening_cash).toBe(1000);
  });

  test("4.8-API-017: [P0] should reject missing required fields", async ({
    authenticatedApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A store with terminal
    const user = await prismaClient.user.create({
      data: createUser(),
    });
    const company = await prismaClient.company.create({
      data: createCompany({ owner_user_id: user.user_id }),
    });
    const store = await prismaClient.store.create({
      data: createStore({ company_id: company.company_id }),
    });

    // WHEN: Opening shift without required fields
    const response = await authenticatedApiRequest.post("/api/shifts/open", {
      store_id: store.store_id,
      // pos_terminal_id missing
      // opening_cash missing
    });

    // THEN: Should return 400 Bad Request
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
  });

  test("4.8-API-018: [P0] should prevent opening shift when active shift exists on terminal", async ({
    authenticatedApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A store with terminal that has active shift
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

    // Create active shift
    await prismaClient.shift.create({
      data: createShift({
        store_id: store.store_id,
        opened_by: user.user_id,
        cashier_id: user.user_id,
        pos_terminal_id: terminal.pos_terminal_id,
        status: "OPEN",
      }),
    });

    // WHEN: Attempting to open another shift on same terminal
    const response = await authenticatedApiRequest.post("/api/shifts/open", {
      store_id: store.store_id,
      pos_terminal_id: terminal.pos_terminal_id,
      opening_cash: 100.0,
    });

    // THEN: Should return error (SHIFT_ALREADY_ACTIVE)
    expect([400, 409]).toContain(response.status());
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error?.code || body.error?.message).toMatch(
      /SHIFT_ALREADY_ACTIVE|active/i,
    );
  });

  test("4.8-API-019: [P0] should allow user with SHIFT_OPEN permission (without CASHIER role) to open shift", async ({
    authenticatedApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A user with SHIFT_OPEN permission but not CASHIER role
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

    // WHEN: Opening shift (user has SHIFT_OPEN permission)
    const response = await authenticatedApiRequest.post("/api/shifts/open", {
      store_id: store.store_id,
      pos_terminal_id: terminal.pos_terminal_id,
      opening_cash: 100.0,
    });

    // THEN: Should succeed (permission check is sufficient, role not required)
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.cashier_id).toBe(user.user_id);
  });
});

// =============================================================================
// SECTION 7: P1 IMPORTANT - EDGE CASES
// =============================================================================

test.describe("4.8-API: Edge Cases", () => {
  test("4.8-API-020: [P1] should handle opening_cash = 0", async ({
    authenticatedApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A store with terminal
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

    // WHEN: Opening shift with opening_cash = 0
    const response = await authenticatedApiRequest.post("/api/shifts/open", {
      store_id: store.store_id,
      pos_terminal_id: terminal.pos_terminal_id,
      opening_cash: 0,
    });

    // THEN: Should succeed
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.opening_cash).toBe(0);
  });

  test("4.8-API-021: [P1] should handle decimal opening_cash values", async ({
    authenticatedApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A store with terminal
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

    // WHEN: Opening shift with decimal opening_cash
    const response = await authenticatedApiRequest.post("/api/shifts/open", {
      store_id: store.store_id,
      pos_terminal_id: terminal.pos_terminal_id,
      opening_cash: 100.5,
    });

    // THEN: Should succeed
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.opening_cash).toBe(100.5);
  });

  test("4.8-API-022: [P1] should return proper response structure for terminal endpoint", async ({
    authenticatedApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A store with terminal
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

    // WHEN: Requesting terminals
    const response = await authenticatedApiRequest.get(
      `/api/stores/${store.store_id}/terminals`,
    );

    // THEN: Should return proper structure (array directly, not wrapped)
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body)).toBe(true);
    if (body.length > 0) {
      const terminalData = body.find(
        (t: any) => t.pos_terminal_id === terminal.pos_terminal_id,
      );
      expect(terminalData).toBeDefined();
      expect(typeof terminalData.pos_terminal_id).toBe("string");
      expect(typeof terminalData.store_id).toBe("string");
      expect(typeof terminalData.name).toBe("string");
      expect(typeof terminalData.has_active_shift).toBe("boolean");
      expect(terminalData.pos_terminal_id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
    }
  });

  test("4.8-API-023: [P1] should return proper response structure for shift opening", async ({
    authenticatedApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A store with terminal
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

    // WHEN: Opening shift
    const response = await authenticatedApiRequest.post("/api/shifts/open", {
      store_id: store.store_id,
      pos_terminal_id: terminal.pos_terminal_id,
      opening_cash: 100.0,
    });

    // THEN: Should return proper structure
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
    expect(typeof body.data.shift_id).toBe("string");
    expect(typeof body.data.store_id).toBe("string");
    expect(typeof body.data.cashier_id).toBe("string");
    expect(typeof body.data.opening_cash).toBe("number");
    expect(body.data.opening_cash).toBeGreaterThanOrEqual(0);
    expect(body.data.cashier_id).toBe(user.user_id);
    expect(body.data.shift_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });
});
