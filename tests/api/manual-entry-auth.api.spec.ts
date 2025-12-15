/**
 * Manual Entry Authorization API Tests
 *
 * Tests for manual entry authorization endpoints:
 * - GET /api/stores/:storeId/active-shift-cashiers
 * - POST /api/auth/verify-cashier-permission
 * - Permission checking for LOTTERY_MANUAL_ENTRY
 * - PIN verification
 *
 * @test-level API
 * @justification Tests API contracts, authentication, and authorization
 * @story 10-4 - Manual Entry Override
 * @priority P0 (Critical - Security & Authorization)
 */

import { test, expect } from "../support/fixtures/rbac.fixture";
import { createShift, createCashier, createUser } from "../support/helpers";
import { ShiftStatus } from "@prisma/client";

test.describe("10-4-API: Manual Entry Authorization", () => {
  test("10-4-API-001: should return active cashiers for store", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: Store with cashiers who have active shifts
    const cashier1 = await createCashier(
      {
        store_id: storeManagerUser.store_id,
        created_by: storeManagerUser.user_id,
        name: "Cashier 1",
        employee_id: "0001",
      },
      prismaClient,
    );

    const cashier2 = await createCashier(
      {
        store_id: storeManagerUser.store_id,
        created_by: storeManagerUser.user_id,
        name: "Cashier 2",
        employee_id: "0002",
      },
      prismaClient,
    );

    // Create active shifts for cashiers
    await createShift(
      {
        store_id: storeManagerUser.store_id,
        opened_by: storeManagerUser.user_id,
        cashier_id: cashier1.cashier_id,
        status: ShiftStatus.ACTIVE,
        opening_cash: 50.0,
      },
      prismaClient,
    );

    await createShift(
      {
        store_id: storeManagerUser.store_id,
        opened_by: storeManagerUser.user_id,
        cashier_id: cashier2.cashier_id,
        status: ShiftStatus.ACTIVE,
        opening_cash: 75.0,
      },
      prismaClient,
    );

    // WHEN: Requesting active shift cashiers
    const response = await storeManagerApiRequest.get(
      `/api/stores/${storeManagerUser.store_id}/active-shift-cashiers`,
    );

    // THEN: Returns list of cashiers with active shifts
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      success: true,
      data: expect.arrayContaining([
        expect.objectContaining({
          id: expect.any(String),
          name: expect.any(String),
          shiftId: expect.any(String),
        }),
      ]),
    });

    // AND: Only cashiers with active shifts are included
    const cashierNames = body.data.map((c: { name: string }) => c.name);
    expect(cashierNames).toContain("Cashier 1");
    expect(cashierNames).toContain("Cashier 2");
  });

  test("10-4-API-002: should verify PIN and return no-user-account when cashier has no matching user", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: Cashier with known PIN (but no matching User account)
    const cashier = await createCashier(
      {
        store_id: storeManagerUser.store_id,
        created_by: storeManagerUser.user_id,
        name: "Test Cashier No User",
        employee_id: "0003",
        pin: "1234", // Known PIN
      },
      prismaClient,
    );

    // WHEN: Verifying PIN
    const response = await storeManagerApiRequest.post(
      "/api/auth/verify-cashier-permission",
      {
        cashierId: cashier.cashier_id,
        pin: "1234",
        permission: "LOTTERY_MANUAL_ENTRY",
        storeId: storeManagerUser.store_id,
      },
    );

    // THEN: PIN verification succeeds but no user account found
    // API returns 401 with valid: true when PIN is valid but no matching User account
    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body).toMatchObject({
      valid: true, // PIN was verified correctly
      error: "Cashier does not have a user account",
    });
  });

  test("10-4-API-003: should check permission when cashier has matching user account", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: Create a user first, then create a cashier with the SAME name
    // This simulates a cashier who also has a user account
    const testUserName = "Test Manager User";

    // Create user with same name as cashier will have using helper
    const user = await createUser(prismaClient, {
      email: `test-manager-${Date.now()}@test.nuvana.local`,
      name: testUserName,
    });

    // Create cashier with same name as the user
    const cashier = await createCashier(
      {
        store_id: storeManagerUser.store_id,
        created_by: storeManagerUser.user_id,
        name: testUserName, // Same name as user - case-insensitive match
        employee_id: "0004",
        pin: "5678",
      },
      prismaClient,
    );

    // WHEN: Verifying permission
    const response = await storeManagerApiRequest.post(
      "/api/auth/verify-cashier-permission",
      {
        cashierId: cashier.cashier_id,
        pin: "5678",
        permission: "LOTTERY_MANUAL_ENTRY",
        storeId: storeManagerUser.store_id,
      },
    );

    // THEN: Permission check returns result (hasPermission depends on user's roles)
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      valid: true,
      userId: user.user_id,
      name: testUserName,
      hasPermission: expect.any(Boolean), // May or may not have permission
    });
  });

  test("10-4-API-004: should return hasPermission false when user lacks permission", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: User without LOTTERY_MANUAL_ENTRY permission and matching cashier
    const testUserName = "Regular User No Permission";

    // Create user with no special roles using helper
    await createUser(prismaClient, {
      email: `regular-user-${Date.now()}@test.nuvana.local`,
      name: testUserName,
    });

    // Create cashier with same name as the user
    const cashier = await createCashier(
      {
        store_id: storeManagerUser.store_id,
        created_by: storeManagerUser.user_id,
        name: testUserName,
        employee_id: "0005",
        pin: "9999",
      },
      prismaClient,
    );

    // WHEN: Verifying permission
    const response = await storeManagerApiRequest.post(
      "/api/auth/verify-cashier-permission",
      {
        cashierId: cashier.cashier_id,
        pin: "9999",
        permission: "LOTTERY_MANUAL_ENTRY",
        storeId: storeManagerUser.store_id,
      },
    );

    // THEN: Permission check returns hasPermission: false
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      valid: true,
      hasPermission: false, // User exists but lacks permission
    });
  });

  test("10-4-API-005: should reject invalid PIN", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: Cashier with known PIN
    const cashier = await createCashier(
      {
        store_id: storeManagerUser.store_id,
        created_by: storeManagerUser.user_id,
        name: "Test Cashier Invalid PIN",
        employee_id: "0006",
        pin: "1234",
      },
      prismaClient,
    );

    // WHEN: Verifying with wrong PIN
    const response = await storeManagerApiRequest.post(
      "/api/auth/verify-cashier-permission",
      {
        cashierId: cashier.cashier_id,
        pin: "9999", // Wrong PIN
        permission: "LOTTERY_MANUAL_ENTRY",
        storeId: storeManagerUser.store_id,
      },
    );

    // THEN: PIN verification fails
    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body).toMatchObject({
      valid: false,
      error: "Invalid PIN",
    });
  });

  // ============================================================================
  // 🔒 SECURITY TESTS (Mandatory - Applied Automatically)
  // ============================================================================

  test("10-4-API-SEC-001: should reject SQL injection in cashierId", async ({
    storeManagerApiRequest,
    storeManagerUser,
  }) => {
    // GIVEN: SQL injection attempt in cashierId
    const sqlInjectionAttempts = [
      "'; DROP TABLE users; --",
      "1' OR '1'='1",
      "1'; DELETE FROM cashiers; --",
      "admin'--",
      "1 UNION SELECT * FROM users--",
    ];

    for (const maliciousInput of sqlInjectionAttempts) {
      // WHEN: Attempting SQL injection in cashierId
      const response = await storeManagerApiRequest.post(
        "/api/auth/verify-cashier-permission",
        {
          cashierId: maliciousInput,
          pin: "1234",
          permission: "LOTTERY_MANUAL_ENTRY",
          storeId: storeManagerUser.store_id,
        },
      );

      // THEN: Request is rejected (400 Bad Request - invalid UUID format)
      // Fastify validation returns { valid: false, error: string } from our handler
      expect(response.status()).toBe(400);
      const body = await response.json();
      // The response contains either { valid: false, error } from our Zod validation
      // or { error: {...} } from Fastify's schema validation
      expect(body).toHaveProperty("error");
    }
  });

  test("10-4-API-SEC-002: should reject SQL injection in storeId", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: Cashier with known PIN
    const cashier = await createCashier(
      {
        store_id: storeManagerUser.store_id,
        created_by: storeManagerUser.user_id,
        name: "Test Cashier SQL",
        employee_id: "0007",
        pin: "1234",
      },
      prismaClient,
    );

    // GIVEN: SQL injection attempts in storeId
    const sqlInjectionAttempts = [
      "'; DROP TABLE stores; --",
      "1' OR '1'='1",
      "1'; DELETE FROM stores; --",
    ];

    for (const maliciousInput of sqlInjectionAttempts) {
      // WHEN: Attempting SQL injection in storeId
      const response = await storeManagerApiRequest.post(
        "/api/auth/verify-cashier-permission",
        {
          cashierId: cashier.cashier_id,
          pin: "1234",
          permission: "LOTTERY_MANUAL_ENTRY",
          storeId: maliciousInput,
        },
      );

      // THEN: Request is rejected (400 Bad Request - invalid UUID format)
      expect(response.status()).toBe(400);
      const body = await response.json();
      expect(body).toHaveProperty("error");
    }
  });

  test("10-4-API-SEC-003: should reject missing authentication token", async ({
    apiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: Cashier with known PIN
    const cashier = await createCashier(
      {
        store_id: storeManagerUser.store_id,
        created_by: storeManagerUser.user_id,
        name: "Test Cashier Unauth",
        employee_id: "0008",
        pin: "1234",
      },
      prismaClient,
    );

    // WHEN: Making request without authentication token
    const response = await apiRequest.post(
      "/api/auth/verify-cashier-permission",
      {
        cashierId: cashier.cashier_id,
        pin: "1234",
        permission: "LOTTERY_MANUAL_ENTRY",
        storeId: storeManagerUser.store_id,
      },
    );

    // THEN: Request is rejected (401 Unauthorized)
    expect(response.status()).toBe(401);
    const body = await response.json();
    // Auth middleware returns { success: false, error: { code, message } }
    expect(body).toHaveProperty("error");
  });

  test("10-4-API-SEC-004: should reject invalid UUID format for cashierId", async ({
    storeManagerApiRequest,
    storeManagerUser,
  }) => {
    // GIVEN: Invalid UUID formats
    const invalidUUIDs = [
      "not-a-uuid",
      "12345",
      "abc-def-ghi",
      "",
      "00000000-0000-0000-0000-00000000000", // Too short
      "00000000-0000-0000-0000-0000000000000", // Too long
    ];

    for (const invalidUUID of invalidUUIDs) {
      // WHEN: Attempting request with invalid UUID
      const response = await storeManagerApiRequest.post(
        "/api/auth/verify-cashier-permission",
        {
          cashierId: invalidUUID,
          pin: "1234",
          permission: "LOTTERY_MANUAL_ENTRY",
          storeId: storeManagerUser.store_id,
        },
      );

      // THEN: Request is rejected (400 Bad Request)
      expect(response.status()).toBe(400);
      const body = await response.json();
      expect(body).toHaveProperty("error");
    }
  });

  test("10-4-API-SEC-005: should reject invalid PIN format (non-4-digit)", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: Cashier with known PIN
    const cashier = await createCashier(
      {
        store_id: storeManagerUser.store_id,
        created_by: storeManagerUser.user_id,
        name: "Test Cashier PIN Format",
        employee_id: "0009",
        pin: "1234",
      },
      prismaClient,
    );

    // GIVEN: Invalid PIN formats
    const invalidPINs = [
      "", // Empty
      "1", // Too short
      "12", // Too short
      "123", // Too short
      "12345", // Too long
      "abcd", // Non-numeric
      "12ab", // Mixed
      "!@#$", // Special characters
      "    ", // Whitespace only
    ];

    for (const invalidPIN of invalidPINs) {
      // WHEN: Attempting request with invalid PIN format
      const response = await storeManagerApiRequest.post(
        "/api/auth/verify-cashier-permission",
        {
          cashierId: cashier.cashier_id,
          pin: invalidPIN,
          permission: "LOTTERY_MANUAL_ENTRY",
          storeId: storeManagerUser.store_id,
        },
      );

      // THEN: Request is rejected (400 Bad Request)
      expect(response.status()).toBe(400);
      const body = await response.json();
      expect(body).toHaveProperty("error");
    }
  });

  test("10-4-API-SEC-006: should reject missing required fields", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: Cashier with known PIN
    const cashier = await createCashier(
      {
        store_id: storeManagerUser.store_id,
        created_by: storeManagerUser.user_id,
        name: "Test Cashier Missing Fields",
        employee_id: "0010",
        pin: "1234",
      },
      prismaClient,
    );

    // WHEN: Missing cashierId
    const response1 = await storeManagerApiRequest.post(
      "/api/auth/verify-cashier-permission",
      {
        pin: "1234",
        permission: "LOTTERY_MANUAL_ENTRY",
        storeId: storeManagerUser.store_id,
      },
    );
    expect(response1.status()).toBe(400);

    // WHEN: Missing pin
    const response2 = await storeManagerApiRequest.post(
      "/api/auth/verify-cashier-permission",
      {
        cashierId: cashier.cashier_id,
        permission: "LOTTERY_MANUAL_ENTRY",
        storeId: storeManagerUser.store_id,
      },
    );
    expect(response2.status()).toBe(400);

    // WHEN: Missing permission
    const response3 = await storeManagerApiRequest.post(
      "/api/auth/verify-cashier-permission",
      {
        cashierId: cashier.cashier_id,
        pin: "1234",
        storeId: storeManagerUser.store_id,
      },
    );
    expect(response3.status()).toBe(400);

    // WHEN: Missing storeId
    const response4 = await storeManagerApiRequest.post(
      "/api/auth/verify-cashier-permission",
      {
        cashierId: cashier.cashier_id,
        pin: "1234",
        permission: "LOTTERY_MANUAL_ENTRY",
      },
    );
    expect(response4.status()).toBe(400);
  });

  test("10-4-API-SEC-007: should not leak sensitive data in responses", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: User and matching Cashier with known PIN
    const testUserName = "Test User Data Leak";

    await createUser(prismaClient, {
      email: `test-data-leak-${Date.now()}@test.nuvana.local`,
      name: testUserName,
    });

    const cashier = await createCashier(
      {
        store_id: storeManagerUser.store_id,
        created_by: storeManagerUser.user_id,
        name: testUserName,
        employee_id: "0011",
        pin: "1234",
      },
      prismaClient,
    );

    // WHEN: Verifying PIN successfully
    const response = await storeManagerApiRequest.post(
      "/api/auth/verify-cashier-permission",
      {
        cashierId: cashier.cashier_id,
        pin: "1234",
        permission: "LOTTERY_MANUAL_ENTRY",
        storeId: storeManagerUser.store_id,
      },
    );

    // THEN: Response does not contain sensitive data
    expect(response.status()).toBe(200);
    const body = await response.json();

    // Assertion: PIN hash should never be in response
    expect(JSON.stringify(body)).not.toContain("pin_hash");
    expect(JSON.stringify(body)).not.toContain("password");
    expect(JSON.stringify(body)).not.toContain("hash");

    // Assertion: Response should only contain expected fields
    expect(body).toHaveProperty("valid");
    expect(body).toHaveProperty("userId");
    expect(body).toHaveProperty("name");
    expect(body).toHaveProperty("hasPermission");
    // Assertion: All fields should be of correct type
    expect(typeof body.valid).toBe("boolean");
    expect(typeof body.userId).toBe("string");
    expect(typeof body.name).toBe("string");
    expect(typeof body.hasPermission).toBe("boolean");
  });

  test("10-4-API-SEC-008: should reject access to cashier from different store", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
    anotherStoreManagerUser,
  }) => {
    // GIVEN: Cashier in a different store
    const cashier = await createCashier(
      {
        store_id: anotherStoreManagerUser.store_id,
        created_by: anotherStoreManagerUser.user_id,
        name: "Other Store Cashier",
        employee_id: "0012",
        pin: "1234",
      },
      prismaClient,
    );

    // WHEN: Attempting to verify cashier from different store
    const response = await storeManagerApiRequest.post(
      "/api/auth/verify-cashier-permission",
      {
        cashierId: cashier.cashier_id,
        pin: "1234",
        permission: "LOTTERY_MANUAL_ENTRY",
        storeId: storeManagerUser.store_id, // Wrong store
      },
    );

    // THEN: Request is rejected (401 Unauthorized - cashier not found in store)
    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body).toHaveProperty("valid", false);
    expect(body).toHaveProperty("error");
  });

  // ============================================================================
  // ✅ ENHANCED ASSERTIONS (Best Practices - Applied Automatically)
  // ============================================================================

  test("10-4-API-ASSERT-001: should return correct response structure for active cashiers", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: Store with cashier who has an active shift
    const cashier = await createCashier(
      {
        store_id: storeManagerUser.store_id,
        created_by: storeManagerUser.user_id,
        name: "Test Cashier Structure",
        employee_id: "0013",
      },
      prismaClient,
    );

    // Create active shift for the cashier (shift must reference the cashier)
    await createShift(
      {
        store_id: storeManagerUser.store_id,
        opened_by: storeManagerUser.user_id,
        cashier_id: cashier.cashier_id,
        status: ShiftStatus.ACTIVE,
        opening_cash: 100.0,
      },
      prismaClient,
    );

    // WHEN: Requesting active shift cashiers
    const response = await storeManagerApiRequest.get(
      `/api/stores/${storeManagerUser.store_id}/active-shift-cashiers`,
    );

    // THEN: Response has correct structure and types
    expect(response.status()).toBe(200);
    const body = await response.json();

    // Assertion: Response has success property (boolean)
    expect(body).toHaveProperty("success");
    expect(typeof body.success).toBe("boolean");
    expect(body.success).toBe(true);

    // Assertion: Response has data property (array)
    expect(body).toHaveProperty("data");
    expect(Array.isArray(body.data)).toBe(true);

    // Assertion: Each cashier has required fields with correct types
    if (body.data.length > 0) {
      const returnedCashier = body.data[0];
      expect(returnedCashier).toHaveProperty("id");
      expect(returnedCashier).toHaveProperty("name");
      expect(returnedCashier).toHaveProperty("shiftId");
      expect(typeof returnedCashier.id).toBe("string");
      expect(typeof returnedCashier.name).toBe("string");
      expect(typeof returnedCashier.shiftId).toBe("string");
      // Assertion: UUID format validation
      expect(returnedCashier.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
      expect(returnedCashier.shiftId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
    }
  });
});
