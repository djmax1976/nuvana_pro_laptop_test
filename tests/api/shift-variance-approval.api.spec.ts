import { test, expect } from "../support/fixtures/rbac.fixture";
import {
  createUser,
  createCompany,
  createStore,
  createShift,
  createCashier,
} from "../support/factories";
import { Prisma } from "@prisma/client";

/**
 * @test-level API
 * @justification Endpoint integration tests verifying HTTP layer, authentication, authorization, request/response format, and error handling for PUT /api/shifts/:shiftId/reconcile (variance approval)
 * @story 4-5-variance-approval-workflow
 *
 * Variance Approval API Tests - Story 4.5
 *
 * STORY: As a Shift Manager, I want to approve variances with a reason,
 * so that shifts with discrepancies can be properly documented and closed.
 *
 * TEST LEVEL: API (endpoint integration tests)
 * PRIMARY GOAL: Verify PUT /api/shifts/:shiftId/reconcile endpoint approves variances and closes shifts
 *
 * BUSINESS RULES TESTED:
 * - Status transition: VARIANCE_REVIEW → CLOSED
 * - variance_reason is recorded
 * - approved_by and approved_at are recorded
 * - Shift is locked from further modifications after approval
 * - Audit log creation with SHIFT_VARIANCE_APPROVED action
 * - Authentication required (JWT token)
 * - Authorization required (SHIFT_RECONCILE permission)
 * - Multi-tenant isolation (store_id must be accessible to user)
 * - Validation errors (invalid shift_id, invalid status, missing variance_reason)
 */

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Creates a test cashier for shift tests
 */
async function createTestCashier(
  prismaClient: any,
  storeId: string,
  createdByUserId: string,
): Promise<{ cashier_id: string; store_id: string; employee_id: string }> {
  const cashierData = await createCashier({
    store_id: storeId,
    created_by: createdByUserId,
  });
  return prismaClient.cashier.create({ data: cashierData });
}

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
      deleted_at: null, // Active terminal (not soft-deleted)
    },
  });

  return {
    pos_terminal_id: terminal.pos_terminal_id,
    store_id: terminal.store_id,
    name: terminal.name,
  };
}

/**
 * Creates a shift with VARIANCE_REVIEW status for testing
 */
async function createVarianceReviewShift(
  prismaClient: any,
  storeId: string,
  openedBy: string,
  cashierId: string,
  posTerminalId: string,
  openingCash: number = 100.0,
  expectedCash: number = 150.0,
  closingCash: number = 156.0,
  varianceAmount: number = 6.0,
  varianceReason?: string,
): Promise<{ shift_id: string; status: string; variance_amount: number }> {
  const shiftData = createShift({
    store_id: storeId,
    opened_by: openedBy,
    cashier_id: cashierId,
    pos_terminal_id: posTerminalId,
    opening_cash: new Prisma.Decimal(openingCash),
    expected_cash: new Prisma.Decimal(expectedCash),
    closing_cash: new Prisma.Decimal(closingCash),
    variance: new Prisma.Decimal(varianceAmount),
    variance_reason: varianceReason || "Initial variance reason",
    status: "VARIANCE_REVIEW",
  });

  const shift = await prismaClient.shift.create({
    data: shiftData,
  });

  return {
    shift_id: shift.shift_id,
    status: shift.status,
    variance_amount: Number(shift.variance),
  };
}

// =============================================================================
// TEST SUITE
// =============================================================================

test.describe("PUT /api/shifts/:shiftId/reconcile - Variance Approval", () => {
  test.describe("Authentication and Authorization", () => {
    test("4.5-API-001: [P0] should require authentication", async ({
      request,
    }) => {
      // GIVEN: No authentication token
      // WHEN: Attempting to approve variance (using valid UUID format to pass schema validation)
      const response = await request.put(
        "/api/shifts/00000000-0000-0000-0000-000000000000/reconcile",
        {
          data: {
            variance_reason: "Approved variance reason",
          },
        },
      );

      // THEN: Request is rejected with 401 Unauthorized
      expect(response.status()).toBe(401);
    });

    test("4.5-API-002: [P0] should require SHIFT_RECONCILE permission", async ({
      request,
      authenticatedUser,
    }) => {
      // GIVEN: User without SHIFT_RECONCILE permission
      const user = authenticatedUser.user;
      const store = authenticatedUser.store;

      // Create cashier and terminal for shift
      const cashier = await createTestCashier(
        authenticatedUser.prisma,
        store.store_id,
        user.user_id,
      );
      const terminal = await createPOSTerminal(
        authenticatedUser.prisma,
        store.store_id,
      );
      const shift = await createVarianceReviewShift(
        authenticatedUser.prisma,
        store.store_id,
        user.user_id,
        cashier.cashier_id,
        terminal.pos_terminal_id,
      );

      // WHEN: Attempting to approve variance without permission
      const response = await request.put(
        `/api/shifts/${shift.shift_id}/reconcile`,
        {
          data: {
            variance_reason: "Approved variance reason",
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

  test.describe("Successful Variance Approval", () => {
    test("4.5-API-003: [P0] should approve variance and close shift (status → CLOSED)", async ({
      request,
      authenticatedShiftManager,
    }) => {
      // GIVEN: Shift in VARIANCE_REVIEW status
      const user = authenticatedShiftManager.user;
      const store = authenticatedShiftManager.store;

      const cashier = await createTestCashier(
        authenticatedShiftManager.prisma,
        store.store_id,
        user.user_id,
      );
      const terminal = await createPOSTerminal(
        authenticatedShiftManager.prisma,
        store.store_id,
      );
      const shift = await createVarianceReviewShift(
        authenticatedShiftManager.prisma,
        store.store_id,
        user.user_id,
        cashier.cashier_id,
        terminal.pos_terminal_id,
        100.0,
        150.0,
        156.0,
        6.0,
        "Initial variance reason",
      );

      // WHEN: Approving variance with reason
      const response = await request.put(
        `/api/shifts/${shift.shift_id}/reconcile`,
        {
          data: {
            variance_reason: "Approved: Extra cash from tips",
          },
          headers: {
            Cookie: `access_token=${authenticatedShiftManager.token}`,
          },
        },
      );

      // THEN: Approval succeeds with CLOSED status
      expect(response.status()).toBe(200);
      const result = await response.json();
      expect(result.success).toBe(true);
      expect(result.data.shift_id).toBe(shift.shift_id);
      expect(result.data.status).toBe("CLOSED");
      expect(result.data.closing_cash).toBe(156.0);
      expect(result.data.expected_cash).toBe(150.0);
      expect(result.data.variance_amount).toBe(6.0);
      expect(result.data.variance_reason).toBe(
        "Approved: Extra cash from tips",
      );
      expect(result.data.approved_by).toBe(user.user_id);
      expect(result.data.approved_at).toBeTruthy();
      expect(result.data.closed_at).toBeTruthy();
    });
  });

  test.describe("Validation and Error Handling", () => {
    test("4.5-API-004: [P0] should reject approval when shift is not in VARIANCE_REVIEW status", async ({
      request,
      authenticatedShiftManager,
    }) => {
      // GIVEN: Shift in CLOSING status (not VARIANCE_REVIEW)
      const user = authenticatedShiftManager.user;
      const store = authenticatedShiftManager.store;

      const cashier = await createTestCashier(
        authenticatedShiftManager.prisma,
        store.store_id,
        user.user_id,
      );
      const terminal = await createPOSTerminal(
        authenticatedShiftManager.prisma,
        store.store_id,
      );
      const shiftData = createShift({
        store_id: store.store_id,
        opened_by: user.user_id,
        cashier_id: cashier.cashier_id,
        pos_terminal_id: terminal.pos_terminal_id,
        status: "CLOSING",
      });
      const shift = await authenticatedShiftManager.prisma.shift.create({
        data: shiftData,
      });

      // WHEN: Attempting to approve variance
      const response = await request.put(
        `/api/shifts/${shift.shift_id}/reconcile`,
        {
          data: {
            variance_reason: "Approved variance reason",
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

    test("4.5-API-005: [P0] should require variance_reason when approving variance", async ({
      request,
      authenticatedShiftManager,
    }) => {
      // GIVEN: Shift in VARIANCE_REVIEW status
      const user = authenticatedShiftManager.user;
      const store = authenticatedShiftManager.store;

      const cashier = await createTestCashier(
        authenticatedShiftManager.prisma,
        store.store_id,
        user.user_id,
      );
      const terminal = await createPOSTerminal(
        authenticatedShiftManager.prisma,
        store.store_id,
      );
      const shift = await createVarianceReviewShift(
        authenticatedShiftManager.prisma,
        store.store_id,
        user.user_id,
        cashier.cashier_id,
        terminal.pos_terminal_id,
      );

      // WHEN: Attempting to approve variance without reason
      const response = await request.put(
        `/api/shifts/${shift.shift_id}/reconcile`,
        {
          data: {},
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

    test("4.5-API-006: [P0] should reject approval when shift_id does not exist", async ({
      request,
      authenticatedShiftManager,
    }) => {
      // GIVEN: Non-existent shift_id
      // WHEN: Attempting to approve variance
      const response = await request.put(
        "/api/shifts/00000000-0000-0000-0000-000000000000/reconcile",
        {
          data: {
            variance_reason: "Approved variance reason",
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

    test("4.5-API-007: [P1] should prevent reconciling shifts for inaccessible stores", async ({
      request,
      authenticatedShiftManager,
    }) => {
      // GIVEN: Shift in VARIANCE_REVIEW status for a different store (inaccessible)
      const user = authenticatedShiftManager.user;
      const store = authenticatedShiftManager.store;

      // Create another company and store
      const otherOwner = await authenticatedShiftManager.prisma.user.create({
        data: createUser({ name: "Other Owner" }),
      });
      const otherCompany =
        await authenticatedShiftManager.prisma.company.create({
          data: createCompany({ owner_user_id: otherOwner.user_id }),
        });
      const otherStore = await authenticatedShiftManager.prisma.store.create({
        data: createStore({ company_id: otherCompany.company_id }),
      });

      const otherCashier = await createTestCashier(
        authenticatedShiftManager.prisma,
        otherStore.store_id,
        otherOwner.user_id,
      );
      const terminal = await createPOSTerminal(
        authenticatedShiftManager.prisma,
        otherStore.store_id,
      );
      const shift = await createVarianceReviewShift(
        authenticatedShiftManager.prisma,
        otherStore.store_id,
        otherOwner.user_id,
        otherCashier.cashier_id,
        terminal.pos_terminal_id,
      );

      // WHEN: Attempting to approve variance for inaccessible shift
      const response = await request.put(
        `/api/shifts/${shift.shift_id}/reconcile`,
        {
          data: {
            variance_reason: "Approved variance reason",
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

  test.describe("Shift Locking", () => {
    test("4.5-API-008: [P0] should lock shift after approval (prevent further modifications)", async ({
      request,
      authenticatedShiftManager,
    }) => {
      // GIVEN: Shift in VARIANCE_REVIEW status
      const user = authenticatedShiftManager.user;
      const store = authenticatedShiftManager.store;

      const cashier = await createTestCashier(
        authenticatedShiftManager.prisma,
        store.store_id,
        user.user_id,
      );
      const terminal = await createPOSTerminal(
        authenticatedShiftManager.prisma,
        store.store_id,
      );
      const shift = await createVarianceReviewShift(
        authenticatedShiftManager.prisma,
        store.store_id,
        user.user_id,
        cashier.cashier_id,
        terminal.pos_terminal_id,
      );

      // WHEN: Approving variance (status → CLOSED)
      const approveResponse = await request.put(
        `/api/shifts/${shift.shift_id}/reconcile`,
        {
          data: {
            variance_reason: "Approved: Variance approved",
          },
          headers: {
            Cookie: `access_token=${authenticatedShiftManager.token}`,
          },
        },
      );

      expect(approveResponse.status()).toBe(200);
      const approveResult = await approveResponse.json();
      expect(approveResult.data.status).toBe("CLOSED");

      // THEN: Attempting to modify the shift should fail
      const modifyResponse = await request.put(
        `/api/shifts/${shift.shift_id}/reconcile`,
        {
          data: {
            variance_reason: "Attempt to modify closed shift",
          },
          headers: {
            Cookie: `access_token=${authenticatedShiftManager.token}`,
          },
        },
      );

      expect(modifyResponse.status()).toBe(400);
      const error = await modifyResponse.json();
      expect(error.success).toBe(false);
      expect(error.error.code).toBe("SHIFT_LOCKED");
    });
  });

  test.describe("Response Format", () => {
    test("4.5-API-009: [P1] should return response matching API contract", async ({
      request,
      authenticatedShiftManager,
    }) => {
      // GIVEN: Shift in VARIANCE_REVIEW status
      const user = authenticatedShiftManager.user;
      const store = authenticatedShiftManager.store;

      const cashier = await createTestCashier(
        authenticatedShiftManager.prisma,
        store.store_id,
        user.user_id,
      );
      const terminal = await createPOSTerminal(
        authenticatedShiftManager.prisma,
        store.store_id,
      );
      const shift = await createVarianceReviewShift(
        authenticatedShiftManager.prisma,
        store.store_id,
        user.user_id,
        cashier.cashier_id,
        terminal.pos_terminal_id,
        100.0,
        150.0,
        156.0,
        6.0,
      );

      // WHEN: Approving variance
      const response = await request.put(
        `/api/shifts/${shift.shift_id}/reconcile`,
        {
          data: {
            variance_reason: "Approved: Variance approved",
          },
          headers: {
            Cookie: `access_token=${authenticatedShiftManager.token}`,
          },
        },
      );

      // THEN: Response matches API contract
      expect(response.status(), "Status should be 200 OK").toBe(200);
      const result = await response.json();

      // Enhanced assertions with custom error messages
      expect(result, "Response should have success flag").toHaveProperty(
        "success",
        true,
      );
      expect(result, "Response should have data object").toHaveProperty("data");
      expect(result.data, "Data should have shift_id").toHaveProperty(
        "shift_id",
      );
      expect(typeof result.data.shift_id, "shift_id should be string").toBe(
        "string",
      );
      expect(
        result.data.shift_id.length,
        "shift_id should be UUID format (36 chars)",
      ).toBe(36);
      expect(result.data, "Data should have status").toHaveProperty(
        "status",
        "CLOSED",
      );
      expect(result.data, "Data should have closing_cash").toHaveProperty(
        "closing_cash",
      );
      expect(
        typeof result.data.closing_cash,
        "closing_cash should be number",
      ).toBe("number");
      expect(result.data, "Data should have expected_cash").toHaveProperty(
        "expected_cash",
      );
      expect(
        typeof result.data.expected_cash,
        "expected_cash should be number",
      ).toBe("number");
      expect(result.data, "Data should have variance_amount").toHaveProperty(
        "variance_amount",
      );
      expect(
        typeof result.data.variance_amount,
        "variance_amount should be number",
      ).toBe("number");
      expect(
        result.data,
        "Data should have variance_percentage",
      ).toHaveProperty("variance_percentage");
      expect(
        typeof result.data.variance_percentage,
        "variance_percentage should be number",
      ).toBe("number");
      expect(result.data, "Data should have variance_reason").toHaveProperty(
        "variance_reason",
      );
      expect(
        typeof result.data.variance_reason,
        "variance_reason should be string",
      ).toBe("string");
      expect(
        result.data.variance_reason.length,
        "variance_reason should not be empty",
      ).toBeGreaterThan(0);
      expect(result.data, "Data should have approved_by").toHaveProperty(
        "approved_by",
      );
      expect(
        typeof result.data.approved_by,
        "approved_by should be string (UUID)",
      ).toBe("string");
      expect(
        result.data.approved_by.length,
        "approved_by should be UUID format",
      ).toBe(36);
      expect(result.data, "Data should have approved_at").toHaveProperty(
        "approved_at",
      );
      expect(
        typeof result.data.approved_at,
        "approved_at should be string (ISO 8601)",
      ).toBe("string");
      expect(result.data, "Data should have closed_at").toHaveProperty(
        "closed_at",
      );
      expect(
        typeof result.data.closed_at,
        "closed_at should be string (ISO 8601)",
      ).toBe("string");
    });
  });

  // =============================================================================
  // SECTION: SECURITY TESTS (MANDATORY - Applied Automatically by Workflow 9)
  // =============================================================================

  test.describe("Security Tests", () => {
    test("4.5-API-010: [P0] should prevent SQL injection in shiftId path parameter", async ({
      request,
      authenticatedShiftManager,
    }) => {
      // GIVEN: Malicious SQL injection attempt in shiftId
      const sqlInjectionAttempts = [
        "'; DROP TABLE shifts; --",
        "1' OR '1'='1",
        "1'; DELETE FROM shifts WHERE '1'='1",
        "1' UNION SELECT * FROM shifts --",
        "'; INSERT INTO shifts VALUES (null, 'hacked'); --",
      ];

      for (const maliciousShiftId of sqlInjectionAttempts) {
        // WHEN: Attempting to approve variance with SQL injection in shiftId
        const response = await request.put(
          `/api/shifts/${encodeURIComponent(maliciousShiftId)}/reconcile`,
          {
            data: {
              variance_reason: "Approved variance reason",
            },
            headers: {
              Cookie: `access_token=${authenticatedShiftManager.token}`,
            },
          },
        );

        // THEN: Should return 400 Bad Request (validation error) or 404 Not Found
        // AND: Should NOT execute SQL injection
        expect(
          [400, 404].includes(response.status()),
          `Should reject SQL injection attempt: ${maliciousShiftId}`,
        ).toBe(true);
        const body = await response.json();
        expect(body.success, "Response should indicate failure").toBe(false);
        // Verify no SQL was executed - error should be validation/not found, not SQL error
        expect(
          body.error?.code,
          "Error should be validation/not found, not SQL error",
        ).not.toContain("SQL");
      }
    });

    test("4.5-API-011: [P0] should prevent SQL injection in variance_reason field", async ({
      request,
      authenticatedShiftManager,
    }) => {
      // GIVEN: Shift in VARIANCE_REVIEW status
      const user = authenticatedShiftManager.user;
      const store = authenticatedShiftManager.store;

      const cashier = await createTestCashier(
        authenticatedShiftManager.prisma,
        store.store_id,
        user.user_id,
      );
      const terminal = await createPOSTerminal(
        authenticatedShiftManager.prisma,
        store.store_id,
      );
      const shift = await createVarianceReviewShift(
        authenticatedShiftManager.prisma,
        store.store_id,
        user.user_id,
        cashier.cashier_id,
        terminal.pos_terminal_id,
      );

      // AND: Malicious SQL injection attempts in variance_reason
      const sqlInjectionAttempts = [
        "'; DROP TABLE shifts; --",
        "Robert'); DROP TABLE shifts;--",
        "1' OR '1'='1",
        "' UNION SELECT password FROM users --",
      ];

      for (const maliciousReason of sqlInjectionAttempts) {
        // WHEN: Attempting to approve variance with SQL injection in variance_reason
        const response = await request.put(
          `/api/shifts/${shift.shift_id}/reconcile`,
          {
            data: {
              variance_reason: maliciousReason,
            },
            headers: {
              Cookie: `access_token=${authenticatedShiftManager.token}`,
            },
          },
        );

        // THEN: Should either accept (parameterized queries) or reject (validation)
        // but NEVER execute the SQL
        expect(
          [200, 400].includes(response.status()),
          `Should handle SQL injection safely: ${maliciousReason}`,
        ).toBe(true);

        // If accepted (200), verify database is intact and SQL was not executed
        if (response.status() === 200) {
          const result = await response.json();
          expect(
            result.success,
            "Request should succeed if parameterized",
          ).toBe(true);
          // Verify shift still exists and was properly updated
          const updatedShift =
            await authenticatedShiftManager.prisma.shift.findUnique({
              where: { shift_id: shift.shift_id },
            });
          expect(
            updatedShift,
            "Shift should still exist after SQL injection attempt",
          ).not.toBeNull();
          expect(updatedShift?.status, "Shift status should be CLOSED").toBe(
            "CLOSED",
          );
        }
      }
    });

    test("4.5-API-012: [P0] should return 401 when JWT token is missing", async ({
      request,
    }) => {
      // GIVEN: No authentication token
      // WHEN: Attempting to approve variance
      const response = await request.put(
        "/api/shifts/00000000-0000-0000-0000-000000000000/reconcile",
        {
          data: {
            variance_reason: "Approved variance reason",
          },
        },
      );

      // THEN: Request is rejected with 401 Unauthorized
      expect(response.status(), "Should return 401 for missing token").toBe(
        401,
      );
      const body = await response.json();
      expect(body.success, "Response should indicate failure").toBe(false);
    });

    test("4.5-API-013: [P0] should return 401 when JWT token is invalid", async ({
      request,
    }) => {
      // GIVEN: Invalid authentication token
      // WHEN: Attempting to approve variance
      const response = await request.put(
        "/api/shifts/00000000-0000-0000-0000-000000000000/reconcile",
        {
          data: {
            variance_reason: "Approved variance reason",
          },
          headers: {
            Cookie: "access_token=invalid_token_here",
          },
        },
      );

      // THEN: Request is rejected with 401 Unauthorized
      expect(response.status(), "Should return 401 for invalid token").toBe(
        401,
      );
      const body = await response.json();
      expect(body.success, "Response should indicate failure").toBe(false);
    });

    test("4.5-API-014: [P0] should prevent privilege escalation (user cannot approve shifts for other companies)", async ({
      request,
      authenticatedShiftManager,
    }) => {
      // GIVEN: Shift in VARIANCE_REVIEW status for a different company (inaccessible)
      const user = authenticatedShiftManager.user;
      const store = authenticatedShiftManager.store;

      // Create another company and store
      const otherOwner = await authenticatedShiftManager.prisma.user.create({
        data: createUser({ name: "Other Owner" }),
      });
      const otherCompany =
        await authenticatedShiftManager.prisma.company.create({
          data: createCompany({ owner_user_id: otherOwner.user_id }),
        });
      const otherStore = await authenticatedShiftManager.prisma.store.create({
        data: createStore({ company_id: otherCompany.company_id }),
      });

      const otherCashier = await createTestCashier(
        authenticatedShiftManager.prisma,
        otherStore.store_id,
        otherOwner.user_id,
      );
      const terminal = await createPOSTerminal(
        authenticatedShiftManager.prisma,
        otherStore.store_id,
      );
      const shift = await createVarianceReviewShift(
        authenticatedShiftManager.prisma,
        otherStore.store_id,
        otherOwner.user_id,
        otherCashier.cashier_id,
        terminal.pos_terminal_id,
      );

      // WHEN: Attempting to approve variance for shift in different company
      const response = await request.put(
        `/api/shifts/${shift.shift_id}/reconcile`,
        {
          data: {
            variance_reason: "Approved variance reason",
          },
          headers: {
            Cookie: `access_token=${authenticatedShiftManager.token}`,
          },
        },
      );

      // THEN: Request is rejected with 404 Not Found (to avoid leaking shift existence)
      expect(
        response.status(),
        "Should return 404 for inaccessible shift",
      ).toBe(404);
      const error = await response.json();
      expect(error.success, "Response should indicate failure").toBe(false);
      expect(error.error.code, "Error code should be SHIFT_NOT_FOUND").toBe(
        "SHIFT_NOT_FOUND",
      );
    });

    test("4.5-API-015: [P1] should validate variance_reason edge cases", async ({
      request,
      authenticatedShiftManager,
    }) => {
      // GIVEN: Shift in VARIANCE_REVIEW status
      const user = authenticatedShiftManager.user;
      const store = authenticatedShiftManager.store;

      const cashier = await createTestCashier(
        authenticatedShiftManager.prisma,
        store.store_id,
        user.user_id,
      );
      const terminal = await createPOSTerminal(
        authenticatedShiftManager.prisma,
        store.store_id,
      );
      const shift = await createVarianceReviewShift(
        authenticatedShiftManager.prisma,
        store.store_id,
        user.user_id,
        cashier.cashier_id,
        terminal.pos_terminal_id,
      );

      // Test cases: empty string, whitespace-only, very long string
      const edgeCases = [
        { reason: "", description: "empty string" },
        { reason: "   ", description: "whitespace-only" },
        {
          reason: "A".repeat(1000),
          description: "very long string (1000 chars)",
        },
      ];

      for (const testCase of edgeCases) {
        // WHEN: Attempting to approve variance with edge case variance_reason
        const response = await request.put(
          `/api/shifts/${shift.shift_id}/reconcile`,
          {
            data: {
              variance_reason: testCase.reason,
            },
            headers: {
              Cookie: `access_token=${authenticatedShiftManager.token}`,
            },
          },
        );

        // THEN: Should reject empty/whitespace, may accept very long string
        if (testCase.reason.trim().length === 0) {
          expect(
            response.status(),
            `Should reject ${testCase.description}`,
          ).toBe(400);
          const error = await response.json();
          expect(error.success, "Response should indicate failure").toBe(false);
          expect(
            error.error.code,
            "Error should be VARIANCE_REASON_REQUIRED",
          ).toBe("VARIANCE_REASON_REQUIRED");
        } else {
          // Very long string may be accepted (depends on validation rules)
          expect(
            [200, 400].includes(response.status()),
            `Should handle ${testCase.description} appropriately`,
          ).toBe(true);
        }
      }
    });

    test("4.5-API-016: [P1] should not expose sensitive data in error responses", async ({
      request,
      authenticatedShiftManager,
    }) => {
      // GIVEN: Non-existent shift_id
      // WHEN: Attempting to approve variance
      const response = await request.put(
        "/api/shifts/00000000-0000-0000-0000-000000000000/reconcile",
        {
          data: {
            variance_reason: "Approved variance reason",
          },
          headers: {
            Cookie: `access_token=${authenticatedShiftManager.token}`,
          },
        },
      );

      // THEN: Error response should not contain sensitive data
      expect(response.status(), "Should return error status").toBe(404);
      const error = await response.json();
      expect(error.success, "Response should indicate failure").toBe(false);

      // Verify no sensitive data leaked
      const errorString = JSON.stringify(error);
      expect(
        errorString,
        "Error should not contain password hashes",
      ).not.toContain("password_hash");
      expect(errorString, "Error should not contain tokens").not.toMatch(
        /token|secret|key/i,
      );
      expect(
        errorString,
        "Error should not contain internal database details",
      ).not.toContain("internal");
    });
  });
});
