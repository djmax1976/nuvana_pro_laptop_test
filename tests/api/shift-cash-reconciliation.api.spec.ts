import { test, expect } from "../support/fixtures/rbac.fixture";
import {
  createUser,
  createCompany,
  createStore,
  createShift,
} from "../support/factories";
import { Prisma } from "@prisma/client";

/**
 * @test-level API
 * @justification Endpoint integration tests verifying HTTP layer, authentication, authorization, request/response format, and error handling for PUT /api/shifts/:shiftId/reconcile
 * @story 4-4-cash-reconciliation
 *
 * Cash Reconciliation API Tests - Story 4.4
 *
 * STORY: As a Shift Manager, I want to reconcile cash by entering actual count,
 * so that variances can be detected and resolved.
 *
 * TEST LEVEL: API (endpoint integration tests)
 * PRIMARY GOAL: Verify PUT /api/shifts/:shiftId/reconcile endpoint reconciles cash with variance detection
 *
 * BUSINESS RULES TESTED:
 * - Variance calculation (actual_cash - expected_cash)
 * - Status transition: CLOSING → RECONCILING (acceptable variance)
 * - Status transition: CLOSING → VARIANCE_REVIEW (variance exceeds threshold)
 * - Variance threshold: $5 absolute OR 1% relative
 * - variance_reason required when status is VARIANCE_REVIEW
 * - variance_reason optional when status is RECONCILING
 * - Audit log creation
 * - Authentication required (JWT token)
 * - Authorization required (SHIFT_RECONCILE permission)
 * - Multi-tenant isolation (store_id must be accessible to user)
 * - Validation errors (invalid shift_id, invalid status, negative cash)
 */

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Creates a POS terminal for testing
 */
async function createPOSTerminal(
  prismaClient: any,
  storeId: string,
  name?: string,
): Promise<{ pos_terminal_id: string; store_id: string; name: string }> {
  const terminal = await prismaClient.pOSTerminal.create({
    data: {
      store_id: storeId,
      name: name || `Terminal ${Date.now()}`,
      device_id: `device-${Date.now()}`,
      status: "ACTIVE",
    },
  });

  return {
    pos_terminal_id: terminal.pos_terminal_id,
    store_id: terminal.store_id,
    name: terminal.name,
  };
}

/**
 * Creates a shift with CLOSING status for testing
 */
async function createClosingShift(
  prismaClient: any,
  storeId: string,
  openedBy: string,
  cashierId: string,
  posTerminalId: string,
  openingCash: number = 100.0,
  expectedCash: number = 150.0,
): Promise<{ shift_id: string; status: string; expected_cash: number }> {
  const shiftData = createShift({
    store_id: storeId,
    opened_by: openedBy,
    cashier_id: cashierId,
    pos_terminal_id: posTerminalId,
    opening_cash: new Prisma.Decimal(openingCash),
    expected_cash: new Prisma.Decimal(expectedCash),
    status: "CLOSING",
  });

  const shift = await prismaClient.shift.create({
    data: shiftData,
  });

  return {
    shift_id: shift.shift_id,
    status: shift.status,
    expected_cash: Number(shift.expected_cash),
  };
}

// =============================================================================
// TEST SUITE
// =============================================================================

test.describe("PUT /api/shifts/:shiftId/reconcile", () => {
  test.describe("Authentication and Authorization", () => {
    test("4.4-API-001: [P0] should require authentication", async ({
      request,
    }) => {
      // GIVEN: No authentication token
      // WHEN: Attempting to reconcile cash (using valid UUID format to pass schema validation)
      const response = await request.put(
        "/api/shifts/00000000-0000-0000-0000-000000000000/reconcile",
        {
          data: {
            closing_cash: 150.0,
          },
        },
      );

      // THEN: Request is rejected with 401 Unauthorized
      expect(response.status()).toBe(401);
    });

    test("4.4-API-002: [P0] should require SHIFT_RECONCILE permission", async ({
      request,
      authenticatedUser,
    }) => {
      // GIVEN: User without SHIFT_RECONCILE permission
      const user = authenticatedUser.user;
      const company = authenticatedUser.company;
      const store = authenticatedUser.store;

      // Create shift
      const terminal = await createPOSTerminal(
        authenticatedUser.prisma,
        store.store_id,
      );
      const shift = await createClosingShift(
        authenticatedUser.prisma,
        store.store_id,
        user.user_id,
        user.user_id,
        terminal.pos_terminal_id,
        100.0,
        150.0,
      );

      // WHEN: Attempting to reconcile cash without permission
      const response = await request.put(
        `/api/shifts/${shift.shift_id}/reconcile`,
        {
          data: {
            closing_cash: 150.0,
          },
          headers: {
            Cookie: `access_token=${authenticatedUser.token}`,
          },
        },
      );

      // THEN: Request is rejected with 403 Forbidden
      expect(response.status()).toBe(403);
      const error = await response.json();
      expect(error.success).toBe(false);
      expect(error.error.code).toBe("PERMISSION_DENIED");
    });
  });

  test.describe("Successful Reconciliation", () => {
    test("4.4-API-003: [P0] should reconcile cash with acceptable variance (status → RECONCILING)", async ({
      request,
      authenticatedShiftManager,
    }) => {
      // GIVEN: Shift in CLOSING status with expected_cash = 150.0
      const user = authenticatedShiftManager.user;
      const store = authenticatedShiftManager.store;

      const terminal = await createPOSTerminal(
        authenticatedShiftManager.prisma,
        store.store_id,
      );
      const shift = await createClosingShift(
        authenticatedShiftManager.prisma,
        store.store_id,
        user.user_id,
        user.user_id,
        terminal.pos_terminal_id,
        100.0,
        150.0,
      );

      // WHEN: Reconciling with closing_cash = 152.0 (variance = $2, < $5 and < 1%)
      const response = await request.put(
        `/api/shifts/${shift.shift_id}/reconcile`,
        {
          data: {
            closing_cash: 152.0,
          },
          headers: {
            Cookie: `access_token=${authenticatedShiftManager.token}`,
          },
        },
      );

      // THEN: Reconciliation succeeds with RECONCILING status
      expect(response.status()).toBe(200);
      const result = await response.json();
      expect(result.success).toBe(true);
      expect(result.data.shift_id).toBe(shift.shift_id);
      expect(result.data.status).toBe("RECONCILING");
      expect(result.data.closing_cash).toBe(152.0);
      expect(result.data.expected_cash).toBe(150.0);
      expect(result.data.variance_amount).toBe(2.0);
      expect(result.data.variance_percentage).toBeCloseTo(1.33, 2);
      expect(result.data.reconciled_by).toBe(user.user_id);
      expect(result.data.reconciled_at).toBeTruthy();
    });

    test("4.4-API-004: [P0] should reconcile cash with variance exceeding $5 threshold (status → VARIANCE_REVIEW)", async ({
      request,
      authenticatedShiftManager,
    }) => {
      // GIVEN: Shift in CLOSING status with expected_cash = 150.0
      const user = authenticatedShiftManager.user;
      const store = authenticatedShiftManager.store;

      const terminal = await createPOSTerminal(
        authenticatedShiftManager.prisma,
        store.store_id,
      );
      const shift = await createClosingShift(
        authenticatedShiftManager.prisma,
        store.store_id,
        user.user_id,
        user.user_id,
        terminal.pos_terminal_id,
        100.0,
        150.0,
      );

      // WHEN: Reconciling with closing_cash = 156.0 (variance = $6, > $5)
      const response = await request.put(
        `/api/shifts/${shift.shift_id}/reconcile`,
        {
          data: {
            closing_cash: 156.0,
            variance_reason: "Extra cash from tips",
          },
          headers: {
            Cookie: `access_token=${authenticatedShiftManager.token}`,
          },
        },
      );

      // THEN: Reconciliation succeeds with VARIANCE_REVIEW status
      expect(response.status()).toBe(200);
      const result = await response.json();
      expect(result.success).toBe(true);
      expect(result.data.shift_id).toBe(shift.shift_id);
      expect(result.data.status).toBe("VARIANCE_REVIEW");
      expect(result.data.closing_cash).toBe(156.0);
      expect(result.data.expected_cash).toBe(150.0);
      expect(result.data.variance_amount).toBe(6.0);
      expect(result.data.variance_percentage).toBeCloseTo(4.0, 2);
      expect(result.data.variance_reason).toBe("Extra cash from tips");
      expect(result.data.reconciled_by).toBe(user.user_id);
    });

    test("4.4-API-005: [P0] should reconcile cash with variance exceeding 1% threshold (status → VARIANCE_REVIEW)", async ({
      request,
      authenticatedShiftManager,
    }) => {
      // GIVEN: Shift in CLOSING status with expected_cash = 1000.0
      const user = authenticatedShiftManager.user;
      const store = authenticatedShiftManager.store;

      const terminal = await createPOSTerminal(
        authenticatedShiftManager.prisma,
        store.store_id,
      );
      const shift = await createClosingShift(
        authenticatedShiftManager.prisma,
        store.store_id,
        user.user_id,
        user.user_id,
        terminal.pos_terminal_id,
        500.0,
        1000.0,
      );

      // WHEN: Reconciling with closing_cash = 1015.0 (variance = $15, < $5 but > 1% of 1000 = $10)
      const response = await request.put(
        `/api/shifts/${shift.shift_id}/reconcile`,
        {
          data: {
            closing_cash: 1015.0,
            variance_reason: "Cash discrepancy found",
          },
          headers: {
            Cookie: `access_token=${authenticatedShiftManager.token}`,
          },
        },
      );

      // THEN: Reconciliation succeeds with VARIANCE_REVIEW status
      expect(response.status()).toBe(200);
      const result = await response.json();
      expect(result.success).toBe(true);
      expect(result.data.status).toBe("VARIANCE_REVIEW");
      expect(result.data.variance_amount).toBe(15.0);
      expect(result.data.variance_percentage).toBeCloseTo(1.5, 2);
      expect(result.data.variance_reason).toBe("Cash discrepancy found");
    });

    test("4.4-API-006: [P0] should allow optional variance_reason when status is RECONCILING", async ({
      request,
      authenticatedShiftManager,
    }) => {
      // GIVEN: Shift in CLOSING status with expected_cash = 150.0
      const user = authenticatedShiftManager.user;
      const store = authenticatedShiftManager.store;

      const terminal = await createPOSTerminal(
        authenticatedShiftManager.prisma,
        store.store_id,
      );
      const shift = await createClosingShift(
        authenticatedShiftManager.prisma,
        store.store_id,
        user.user_id,
        user.user_id,
        terminal.pos_terminal_id,
        100.0,
        150.0,
      );

      // WHEN: Reconciling with acceptable variance and optional variance_reason
      const response = await request.put(
        `/api/shifts/${shift.shift_id}/reconcile`,
        {
          data: {
            closing_cash: 152.0,
            variance_reason: "Minor rounding difference",
          },
          headers: {
            Cookie: `access_token=${authenticatedShiftManager.token}`,
          },
        },
      );

      // THEN: Reconciliation succeeds with RECONCILING status and optional reason recorded
      expect(response.status()).toBe(200);
      const result = await response.json();
      expect(result.success).toBe(true);
      expect(result.data.status).toBe("RECONCILING");
      expect(result.data.variance_reason).toBe("Minor rounding difference");
    });
  });

  test.describe("Validation Errors", () => {
    test("4.4-API-007: [P0] should reject reconciliation when shift is not in CLOSING status", async ({
      request,
      authenticatedShiftManager,
    }) => {
      // GIVEN: Shift in OPEN status (not CLOSING)
      const user = authenticatedShiftManager.user;
      const store = authenticatedShiftManager.store;

      const terminal = await createPOSTerminal(
        authenticatedShiftManager.prisma,
        store.store_id,
      );
      const shiftData = createShift({
        store_id: store.store_id,
        opened_by: user.user_id,
        cashier_id: user.user_id,
        pos_terminal_id: terminal.pos_terminal_id,
        opening_cash: new Prisma.Decimal(100.0),
        status: "OPEN",
      });
      const shift = await authenticatedShiftManager.prisma.shift.create({
        data: shiftData,
      });

      // WHEN: Attempting to reconcile
      const response = await request.put(
        `/api/shifts/${shift.shift_id}/reconcile`,
        {
          data: {
            closing_cash: 150.0,
          },
          headers: {
            Cookie: `access_token=${authenticatedShiftManager.token}`,
          },
        },
      );

      // THEN: Request is rejected with error
      expect(response.status()).toBe(400);
      const error = await response.json();
      expect(error.success).toBe(false);
      expect(error.error.code).toBe("SHIFT_INVALID_STATUS");
    });

    test("4.4-API-008: [P0] should reject reconciliation when shift_id does not exist", async ({
      request,
      authenticatedShiftManager,
    }) => {
      // GIVEN: Invalid shift_id
      // WHEN: Attempting to reconcile
      const response = await request.put(
        "/api/shifts/00000000-0000-0000-0000-000000000000/reconcile",
        {
          data: {
            closing_cash: 150.0,
          },
          headers: {
            Cookie: `access_token=${authenticatedShiftManager.token}`,
          },
        },
      );

      // THEN: Request is rejected with error
      expect(response.status()).toBe(404);
      const error = await response.json();
      expect(error.success).toBe(false);
      expect(error.error.code).toBe("SHIFT_NOT_FOUND");
    });

    test("4.4-API-009: [P0] should reject reconciliation when closing_cash is negative", async ({
      request,
      authenticatedShiftManager,
    }) => {
      // GIVEN: Shift in CLOSING status
      const user = authenticatedShiftManager.user;
      const store = authenticatedShiftManager.store;

      const terminal = await createPOSTerminal(
        authenticatedShiftManager.prisma,
        store.store_id,
      );
      const shift = await createClosingShift(
        authenticatedShiftManager.prisma,
        store.store_id,
        user.user_id,
        user.user_id,
        terminal.pos_terminal_id,
        100.0,
        150.0,
      );

      // WHEN: Attempting to reconcile with negative cash
      const response = await request.put(
        `/api/shifts/${shift.shift_id}/reconcile`,
        {
          data: {
            closing_cash: -10.0,
          },
          headers: {
            Cookie: `access_token=${authenticatedShiftManager.token}`,
          },
        },
      );

      // THEN: Request is rejected with error
      expect(response.status()).toBe(400);
      const error = await response.json();
      expect(error.success).toBe(false);
      // Zod validation happens first, so may return VALIDATION_ERROR
      expect(["INVALID_CASH_AMOUNT", "VALIDATION_ERROR"]).toContain(
        error.error.code,
      );
    });

    test("4.4-API-010: [P0] should require variance_reason when variance exceeds threshold", async ({
      request,
      authenticatedShiftManager,
    }) => {
      // GIVEN: Shift in CLOSING status with expected_cash = 150.0
      const user = authenticatedShiftManager.user;
      const store = authenticatedShiftManager.store;

      const terminal = await createPOSTerminal(
        authenticatedShiftManager.prisma,
        store.store_id,
      );
      const shift = await createClosingShift(
        authenticatedShiftManager.prisma,
        store.store_id,
        user.user_id,
        user.user_id,
        terminal.pos_terminal_id,
        100.0,
        150.0,
      );

      // WHEN: Reconciling with variance > $5 but no variance_reason
      const response = await request.put(
        `/api/shifts/${shift.shift_id}/reconcile`,
        {
          data: {
            closing_cash: 156.0,
            // variance_reason missing
          },
          headers: {
            Cookie: `access_token=${authenticatedShiftManager.token}`,
          },
        },
      );

      // THEN: Request is rejected with error
      expect(response.status()).toBe(400);
      const error = await response.json();
      expect(error.success).toBe(false);
      expect(error.error.code).toBe("VARIANCE_REASON_REQUIRED");
    });
  });

  test.describe("RLS Policy Enforcement", () => {
    test("4.4-API-011: [P0] should prevent reconciling shifts for inaccessible stores", async ({
      request,
      authenticatedShiftManager,
    }) => {
      // GIVEN: Shift in CLOSING status for a different store (not accessible to user)
      const user = authenticatedShiftManager.user;

      // Create another company/store that user cannot access
      const otherCompany =
        await authenticatedShiftManager.prisma.company.create({
          data: createCompany({ owner_user_id: user.user_id }),
        });
      const otherStore = await authenticatedShiftManager.prisma.store.create({
        data: createStore({ company_id: otherCompany.company_id }),
      });
      const terminal = await createPOSTerminal(
        authenticatedShiftManager.prisma,
        otherStore.store_id,
      );
      const shift = await createClosingShift(
        authenticatedShiftManager.prisma,
        otherStore.store_id,
        user.user_id,
        user.user_id,
        terminal.pos_terminal_id,
        100.0,
        150.0,
      );

      // WHEN: Attempting to reconcile shift from inaccessible store
      const response = await request.put(
        `/api/shifts/${shift.shift_id}/reconcile`,
        {
          data: {
            closing_cash: 150.0,
          },
          headers: {
            Cookie: `access_token=${authenticatedShiftManager.token}`,
          },
        },
      );

      // THEN: Request is rejected with error
      expect(response.status()).toBe(404);
      const error = await response.json();
      expect(error.success).toBe(false);
      expect(error.error.code).toBe("SHIFT_NOT_FOUND");
    });
  });

  test.describe("Response Format", () => {
    test("4.4-API-012: [P0] should return response matching API contract", async ({
      request,
      authenticatedShiftManager,
    }) => {
      // GIVEN: Shift in CLOSING status
      const user = authenticatedShiftManager.user;
      const store = authenticatedShiftManager.store;

      const terminal = await createPOSTerminal(
        authenticatedShiftManager.prisma,
        store.store_id,
      );
      const shift = await createClosingShift(
        authenticatedShiftManager.prisma,
        store.store_id,
        user.user_id,
        user.user_id,
        terminal.pos_terminal_id,
        100.0,
        150.0,
      );

      // WHEN: Reconciling cash
      const response = await request.put(
        `/api/shifts/${shift.shift_id}/reconcile`,
        {
          data: {
            closing_cash: 152.0,
          },
          headers: {
            Cookie: `access_token=${authenticatedShiftManager.token}`,
          },
        },
      );

      // THEN: Response matches API contract structure
      expect(response.status()).toBe(200);
      const result = await response.json();
      expect(result).toHaveProperty("success", true);
      expect(result).toHaveProperty("data");
      expect(result.data).toHaveProperty("shift_id");
      expect(result.data).toHaveProperty("status");
      expect(result.data).toHaveProperty("closing_cash");
      expect(result.data).toHaveProperty("expected_cash");
      expect(result.data).toHaveProperty("variance_amount");
      expect(result.data).toHaveProperty("variance_percentage");
      expect(result.data).toHaveProperty("reconciled_at");
      expect(result.data).toHaveProperty("reconciled_by");
      expect(typeof result.data.shift_id).toBe("string");
      expect(typeof result.data.status).toBe("string");
      expect(typeof result.data.closing_cash).toBe("number");
      expect(typeof result.data.expected_cash).toBe("number");
      expect(typeof result.data.variance_amount).toBe("number");
      expect(typeof result.data.variance_percentage).toBe("number");
    });

    test("4.4-API-013: [P0] should return reconciled_at in ISO 8601 format", async ({
      request,
      authenticatedShiftManager,
    }) => {
      // GIVEN: Shift in CLOSING status
      const user = authenticatedShiftManager.user;
      const store = authenticatedShiftManager.store;

      const terminal = await createPOSTerminal(
        authenticatedShiftManager.prisma,
        store.store_id,
      );
      const shift = await createClosingShift(
        authenticatedShiftManager.prisma,
        store.store_id,
        user.user_id,
        user.user_id,
        terminal.pos_terminal_id,
        100.0,
        150.0,
      );

      // WHEN: Reconciling cash
      const response = await request.put(
        `/api/shifts/${shift.shift_id}/reconcile`,
        {
          data: {
            closing_cash: 152.0,
          },
          headers: {
            Cookie: `access_token=${authenticatedShiftManager.token}`,
          },
        },
      );

      // THEN: reconciled_at is valid ISO 8601 format
      expect(response.status()).toBe(200);
      const result = await response.json();
      expect(result.success).toBe(true);
      expect(result.data.reconciled_at).toBeTruthy();
      expect(typeof result.data.reconciled_at).toBe("string");
      // Validate ISO 8601 format (YYYY-MM-DDTHH:mm:ss.sssZ)
      // Pattern is safe: bounded quantifiers, no nested quantifiers
      const iso8601Pattern =
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/; // eslint-disable-line security/detect-unsafe-regex
      expect(result.data.reconciled_at).toMatch(iso8601Pattern);
      // Should be parseable as Date
      const reconciledDate = new Date(result.data.reconciled_at);
      expect(reconciledDate.getTime()).not.toBeNaN();
    });

    test("4.4-API-014: [P0] should return reconciled_by as valid UUID", async ({
      request,
      authenticatedShiftManager,
    }) => {
      // GIVEN: Shift in CLOSING status
      const user = authenticatedShiftManager.user;
      const store = authenticatedShiftManager.store;

      const terminal = await createPOSTerminal(
        authenticatedShiftManager.prisma,
        store.store_id,
      );
      const shift = await createClosingShift(
        authenticatedShiftManager.prisma,
        store.store_id,
        user.user_id,
        user.user_id,
        terminal.pos_terminal_id,
        100.0,
        150.0,
      );

      // WHEN: Reconciling cash
      const response = await request.put(
        `/api/shifts/${shift.shift_id}/reconcile`,
        {
          data: {
            closing_cash: 152.0,
          },
          headers: {
            Cookie: `access_token=${authenticatedShiftManager.token}`,
          },
        },
      );

      // THEN: reconciled_by is valid UUID format
      expect(response.status()).toBe(200);
      const result = await response.json();
      expect(result.success).toBe(true);
      expect(result.data.reconciled_by).toBeTruthy();
      expect(typeof result.data.reconciled_by).toBe("string");
      // Validate UUID format
      expect(result.data.reconciled_by).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
      expect(result.data.reconciled_by).toBe(user.user_id);
    });

    test("4.4-API-015: [P0] should return status as valid enum value", async ({
      request,
      authenticatedShiftManager,
    }) => {
      // GIVEN: Shift in CLOSING status
      const user = authenticatedShiftManager.user;
      const store = authenticatedShiftManager.store;

      const terminal = await createPOSTerminal(
        authenticatedShiftManager.prisma,
        store.store_id,
      );
      const shift = await createClosingShift(
        authenticatedShiftManager.prisma,
        store.store_id,
        user.user_id,
        user.user_id,
        terminal.pos_terminal_id,
        100.0,
        150.0,
      );

      // WHEN: Reconciling cash
      const response = await request.put(
        `/api/shifts/${shift.shift_id}/reconcile`,
        {
          data: {
            closing_cash: 152.0,
          },
          headers: {
            Cookie: `access_token=${authenticatedShiftManager.token}`,
          },
        },
      );

      // THEN: Status is valid enum value
      expect(response.status()).toBe(200);
      const result = await response.json();
      expect(result.success).toBe(true);
      expect(["RECONCILING", "VARIANCE_REVIEW"]).toContain(result.data.status);
    });
  });

  test.describe("Security Tests", () => {
    test("4.4-API-016: [SECURITY] should prevent SQL injection in shiftId path parameter", async ({
      request,
      authenticatedShiftManager,
    }) => {
      // GIVEN: Malicious SQL injection attempt in shiftId
      const sqlInjectionAttempts = [
        "'; DROP TABLE shifts; --",
        "1' OR '1'='1",
        "1'; DELETE FROM shifts WHERE '1'='1",
        "1' UNION SELECT * FROM shifts --",
      ];

      for (const maliciousId of sqlInjectionAttempts) {
        // WHEN: Attempting to reconcile with SQL injection in shiftId
        const response = await request.put(
          `/api/shifts/${encodeURIComponent(maliciousId)}/reconcile`,
          {
            data: {
              closing_cash: 150.0,
            },
            headers: {
              Cookie: `access_token=${authenticatedShiftManager.token}`,
            },
          },
        );

        // THEN: Request is rejected (either 400 for invalid UUID format or 404 for not found)
        expect([400, 404]).toContain(response.status());
        const error = await response.json();
        expect(error.success).toBe(false);
      }
    });

    test("4.4-API-017: [SECURITY] should prevent SQL injection in closing_cash field", async ({
      request,
      authenticatedShiftManager,
    }) => {
      // GIVEN: Shift in CLOSING status
      const user = authenticatedShiftManager.user;
      const store = authenticatedShiftManager.store;

      const terminal = await createPOSTerminal(
        authenticatedShiftManager.prisma,
        store.store_id,
      );
      const shift = await createClosingShift(
        authenticatedShiftManager.prisma,
        store.store_id,
        user.user_id,
        user.user_id,
        terminal.pos_terminal_id,
        100.0,
        150.0,
      );

      // WHEN: Attempting to reconcile with SQL injection in closing_cash
      const sqlInjectionAttempts = [
        "'; DROP TABLE shifts; --",
        "1' OR '1'='1",
        "150'; DELETE FROM shifts --",
      ];

      for (const maliciousValue of sqlInjectionAttempts) {
        const response = await request.put(
          `/api/shifts/${shift.shift_id}/reconcile`,
          {
            data: {
              closing_cash: maliciousValue as any,
            },
            headers: {
              Cookie: `access_token=${authenticatedShiftManager.token}`,
            },
          },
        );

        // THEN: Request is rejected with validation error
        expect(response.status()).toBe(400);
        const error = await response.json();
        expect(error.success).toBe(false);
      }
    });

    test("4.4-API-018: [SECURITY] should reject request with invalid token format", async ({
      request,
    }) => {
      // GIVEN: Invalid token format
      // WHEN: Attempting to reconcile cash
      const response = await request.put(
        "/api/shifts/00000000-0000-0000-0000-000000000000/reconcile",
        {
          data: {
            closing_cash: 150.0,
          },
          headers: {
            Cookie: "access_token=invalid-token-format",
          },
        },
      );

      // THEN: Request is rejected with 401 Unauthorized
      expect(response.status()).toBe(401);
    });

    test("4.4-API-019: [SECURITY] should reject request with malformed token", async ({
      request,
    }) => {
      // GIVEN: Malformed JWT token
      // WHEN: Attempting to reconcile cash
      const response = await request.put(
        "/api/shifts/00000000-0000-0000-0000-000000000000/reconcile",
        {
          data: {
            closing_cash: 150.0,
          },
          headers: {
            Cookie: "access_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid",
          },
        },
      );

      // THEN: Request is rejected with 401 Unauthorized
      expect(response.status()).toBe(401);
    });
  });

  test.describe("Input Validation Edge Cases", () => {
    test("4.4-API-020: [EDGE] should reject reconciliation when closing_cash is zero", async ({
      request,
      authenticatedShiftManager,
    }) => {
      // GIVEN: Shift in CLOSING status
      const user = authenticatedShiftManager.user;
      const store = authenticatedShiftManager.store;

      const terminal = await createPOSTerminal(
        authenticatedShiftManager.prisma,
        store.store_id,
      );
      const shift = await createClosingShift(
        authenticatedShiftManager.prisma,
        store.store_id,
        user.user_id,
        user.user_id,
        terminal.pos_terminal_id,
        100.0,
        150.0,
      );

      // WHEN: Attempting to reconcile with zero cash
      const response = await request.put(
        `/api/shifts/${shift.shift_id}/reconcile`,
        {
          data: {
            closing_cash: 0,
          },
          headers: {
            Cookie: `access_token=${authenticatedShiftManager.token}`,
          },
        },
      );

      // THEN: Request is rejected with error
      expect(response.status()).toBe(400);
      const error = await response.json();
      expect(error.success).toBe(false);
      // Should be validation error (Zod schema requires positive number)
      expect(["INVALID_CASH_AMOUNT", "VALIDATION_ERROR"]).toContain(
        error.error.code,
      );
    });

    test("4.4-API-021: [EDGE] should reject reconciliation when closing_cash is missing", async ({
      request,
      authenticatedShiftManager,
    }) => {
      // GIVEN: Shift in CLOSING status
      const user = authenticatedShiftManager.user;
      const store = authenticatedShiftManager.store;

      const terminal = await createPOSTerminal(
        authenticatedShiftManager.prisma,
        store.store_id,
      );
      const shift = await createClosingShift(
        authenticatedShiftManager.prisma,
        store.store_id,
        user.user_id,
        user.user_id,
        terminal.pos_terminal_id,
        100.0,
        150.0,
      );

      // WHEN: Attempting to reconcile without closing_cash
      const response = await request.put(
        `/api/shifts/${shift.shift_id}/reconcile`,
        {
          data: {},
          headers: {
            Cookie: `access_token=${authenticatedShiftManager.token}`,
          },
        },
      );

      // THEN: Request is rejected with validation error
      expect(response.status()).toBe(400);
      const error = await response.json();
      expect(error.success).toBe(false);
      expect(["VALIDATION_ERROR", "INVALID_CASH_AMOUNT"]).toContain(
        error.error.code,
      );
    });

    test("4.4-API-022: [EDGE] should reject reconciliation when closing_cash is not a number", async ({
      request,
      authenticatedShiftManager,
    }) => {
      // GIVEN: Shift in CLOSING status
      const user = authenticatedShiftManager.user;
      const store = authenticatedShiftManager.store;

      const terminal = await createPOSTerminal(
        authenticatedShiftManager.prisma,
        store.store_id,
      );
      const shift = await createClosingShift(
        authenticatedShiftManager.prisma,
        store.store_id,
        user.user_id,
        user.user_id,
        terminal.pos_terminal_id,
        100.0,
        150.0,
      );

      // WHEN: Attempting to reconcile with non-numeric closing_cash
      const response = await request.put(
        `/api/shifts/${shift.shift_id}/reconcile`,
        {
          data: {
            closing_cash: "not-a-number",
          },
          headers: {
            Cookie: `access_token=${authenticatedShiftManager.token}`,
          },
        },
      );

      // THEN: Request is rejected with validation error
      expect(response.status()).toBe(400);
      const error = await response.json();
      expect(error.success).toBe(false);
      expect(error.error.code).toBe("VALIDATION_ERROR");
    });

    test("4.4-API-023: [EDGE] should reject reconciliation when variance_reason is empty string", async ({
      request,
      authenticatedShiftManager,
    }) => {
      // GIVEN: Shift in CLOSING status
      const user = authenticatedShiftManager.user;
      const store = authenticatedShiftManager.store;

      const terminal = await createPOSTerminal(
        authenticatedShiftManager.prisma,
        store.store_id,
      );
      const shift = await createClosingShift(
        authenticatedShiftManager.prisma,
        store.store_id,
        user.user_id,
        user.user_id,
        terminal.pos_terminal_id,
        100.0,
        150.0,
      );

      // WHEN: Attempting to reconcile with empty string variance_reason
      const response = await request.put(
        `/api/shifts/${shift.shift_id}/reconcile`,
        {
          data: {
            closing_cash: 152.0,
            variance_reason: "",
          },
          headers: {
            Cookie: `access_token=${authenticatedShiftManager.token}`,
          },
        },
      );

      // THEN: Request is rejected with validation error
      expect(response.status()).toBe(400);
      const error = await response.json();
      expect(error.success).toBe(false);
      expect(error.error.code).toBe("VALIDATION_ERROR");
    });

    test("4.4-API-024: [EDGE] should reject reconciliation when variance_reason is whitespace only", async ({
      request,
      authenticatedShiftManager,
    }) => {
      // GIVEN: Shift in CLOSING status
      const user = authenticatedShiftManager.user;
      const store = authenticatedShiftManager.store;

      const terminal = await createPOSTerminal(
        authenticatedShiftManager.prisma,
        store.store_id,
      );
      const shift = await createClosingShift(
        authenticatedShiftManager.prisma,
        store.store_id,
        user.user_id,
        user.user_id,
        terminal.pos_terminal_id,
        100.0,
        150.0,
      );

      // WHEN: Attempting to reconcile with whitespace-only variance_reason
      const response = await request.put(
        `/api/shifts/${shift.shift_id}/reconcile`,
        {
          data: {
            closing_cash: 152.0,
            variance_reason: "   ",
          },
          headers: {
            Cookie: `access_token=${authenticatedShiftManager.token}`,
          },
        },
      );

      // THEN: Request is rejected with validation error
      expect(response.status()).toBe(400);
      const error = await response.json();
      expect(error.success).toBe(false);
      expect(error.error.code).toBe("VALIDATION_ERROR");
    });
  });
});
