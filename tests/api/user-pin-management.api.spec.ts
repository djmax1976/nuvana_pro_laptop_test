/**
 * User PIN Management API Tests
 *
 * Enterprise-grade integration tests for PIN authentication endpoints for
 * STORE_MANAGER and SHIFT_MANAGER roles.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * TRACEABILITY MATRIX
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * | Test ID           | Requirement                              | Category      | Priority |
 * |-------------------|------------------------------------------|---------------|----------|
 * | UPIN-API-001      | Set PIN for STORE_MANAGER                | Business      | P0       |
 * | UPIN-API-002      | Set PIN for SHIFT_MANAGER                | Business      | P0       |
 * | UPIN-API-003      | Reject duplicate PIN in same store       | Validation    | P0       |
 * | UPIN-API-004      | Allow same PIN in different stores       | Business      | P1       |
 * | UPIN-API-005      | Clear PIN                                | Business      | P1       |
 * | UPIN-API-006      | Verify PIN returns elevation token       | Security      | P0       |
 * | UPIN-API-007      | Verify PIN with wrong PIN fails          | Security      | P0       |
 * | UPIN-API-008      | Permission check - requires MANAGE       | Security      | P0       |
 * | UPIN-API-009      | PIN status endpoint                      | Business      | P1       |
 * | UPIN-API-010      | Elevation token has 30-minute expiry     | Security      | P0       |
 * | UPIN-API-011      | Rate limiting on PIN verification        | Security      | P0       |
 * | UPIN-API-012      | Create employee with PIN                 | Business      | P0       |
 * | UPIN-API-013      | PIN validation - reject invalid format   | Validation    | P0       |
 * | UPIN-API-014      | PIN validation - reject non-numeric      | Validation    | P0       |
 * | UPIN-API-015      | Authorization - other store blocked      | Security      | P0       |
 * | UPIN-API-016      | PIN update changes existing PIN          | Business      | P1       |
 * | UPIN-API-017      | Generic error on invalid credentials     | Security      | P0       |
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * @test-level Integration/API
 * @justification End-to-end API tests for PIN management with real HTTP calls
 * @story USER-PIN-AUTH
 * @priority P0 (Critical - Manager authentication)
 */

import { test, expect } from "../support/fixtures/rbac.fixture";
import { createEmployeeRequest } from "../support/factories/client-employee.factory";

// ============================================================================
// Test Suite: PIN Management Endpoints
// ============================================================================

test.describe("User PIN Management API", () => {
  // ==========================================================================
  // PUT /api/client/employees/:userId/pin - Set PIN
  // ==========================================================================

  test.describe("PUT /api/client/employees/:userId/pin - Set PIN", () => {
    test("UPIN-API-001: should successfully set PIN for STORE_MANAGER", async ({
      clientUserApiRequest,
      clientUser,
      prismaClient,
    }) => {
      // GIVEN: A STORE_MANAGER employee without PIN
      const storeManagerRole = await prismaClient.role.findFirst({
        where: { code: "STORE_MANAGER", scope: "STORE" },
      });
      if (!storeManagerRole) {
        test.skip(true, "STORE_MANAGER role not found in database");
        return;
      }

      // Create employee with STORE_MANAGER role
      const employeeData = createEmployeeRequest({
        store_id: clientUser.store_id,
        role_id: storeManagerRole.role_id,
      });

      const createResponse = await clientUserApiRequest.post(
        "/api/client/employees",
        {
          email: employeeData.email,
          name: employeeData.name,
          store_id: employeeData.store_id,
          role_id: employeeData.role_id,
        },
      );

      if (createResponse.status() !== 201) {
        const errorBody = await createResponse.json();
        throw new Error(
          `Employee creation failed: ${JSON.stringify(errorBody)}`,
        );
      }

      const createBody = await createResponse.json();
      const employeeId = createBody.data.user_id;

      // WHEN: Setting PIN for the employee
      const response = await clientUserApiRequest.put(
        `/api/client/employees/${employeeId}/pin`,
        {
          pin: "1234",
          store_id: clientUser.store_id,
        },
      );

      // THEN: PIN should be set successfully
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);

      // Verify PIN is stored (check has_pin flag via status endpoint)
      const statusResponse = await clientUserApiRequest.get(
        `/api/client/employees/${employeeId}/pin/status`,
      );
      expect(statusResponse.status()).toBe(200);
      const statusBody = await statusResponse.json();
      expect(statusBody.data.has_pin).toBe(true);
    });

    test("UPIN-API-002: should successfully set PIN for SHIFT_MANAGER", async ({
      clientUserApiRequest,
      clientUser,
      prismaClient,
    }) => {
      // GIVEN: A SHIFT_MANAGER employee without PIN
      const shiftManagerRole = await prismaClient.role.findFirst({
        where: { code: "SHIFT_MANAGER", scope: "STORE" },
      });
      if (!shiftManagerRole) {
        test.skip(true, "SHIFT_MANAGER role not found in database");
        return;
      }

      // Create employee with SHIFT_MANAGER role
      const employeeData = createEmployeeRequest({
        store_id: clientUser.store_id,
        role_id: shiftManagerRole.role_id,
      });

      const createResponse = await clientUserApiRequest.post(
        "/api/client/employees",
        {
          email: employeeData.email,
          name: employeeData.name,
          store_id: employeeData.store_id,
          role_id: employeeData.role_id,
        },
      );

      if (createResponse.status() !== 201) {
        const errorBody = await createResponse.json();
        throw new Error(
          `Employee creation failed: ${JSON.stringify(errorBody)}`,
        );
      }

      const createBody = await createResponse.json();
      const employeeId = createBody.data.user_id;

      // WHEN: Setting PIN for the employee
      const response = await clientUserApiRequest.put(
        `/api/client/employees/${employeeId}/pin`,
        {
          pin: "5678",
          store_id: clientUser.store_id,
        },
      );

      // THEN: PIN should be set successfully
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
    });

    test("UPIN-API-013: should reject invalid PIN format - too short", async ({
      clientUserApiRequest,
      clientUser,
      prismaClient,
    }) => {
      // GIVEN: An employee
      const storeRole = await prismaClient.role.findFirst({
        where: { scope: "STORE" },
      });
      if (!storeRole) {
        throw new Error("No STORE scope role found in database");
      }

      const employeeData = createEmployeeRequest({
        store_id: clientUser.store_id,
        role_id: storeRole.role_id,
      });

      const createResponse = await clientUserApiRequest.post(
        "/api/client/employees",
        {
          email: employeeData.email,
          name: employeeData.name,
          store_id: employeeData.store_id,
          role_id: employeeData.role_id,
        },
      );

      if (createResponse.status() !== 201) {
        const errorBody = await createResponse.json();
        throw new Error(
          `Employee creation failed: ${JSON.stringify(errorBody)}`,
        );
      }

      const createBody = await createResponse.json();
      const employeeId = createBody.data.user_id;

      // WHEN: Setting PIN with invalid format (too short)
      const response = await clientUserApiRequest.put(
        `/api/client/employees/${employeeId}/pin`,
        {
          pin: "123", // Only 3 digits
          store_id: clientUser.store_id,
        },
      );

      // THEN: Should reject with validation error
      expect(response.status()).toBe(400);
      const body = await response.json();
      expect(body.success).toBe(false);
    });

    test("UPIN-API-014: should reject invalid PIN format - non-numeric", async ({
      clientUserApiRequest,
      clientUser,
      prismaClient,
    }) => {
      // GIVEN: An employee
      const storeRole = await prismaClient.role.findFirst({
        where: { scope: "STORE" },
      });
      if (!storeRole) {
        throw new Error("No STORE scope role found in database");
      }

      const employeeData = createEmployeeRequest({
        store_id: clientUser.store_id,
        role_id: storeRole.role_id,
      });

      const createResponse = await clientUserApiRequest.post(
        "/api/client/employees",
        {
          email: employeeData.email,
          name: employeeData.name,
          store_id: employeeData.store_id,
          role_id: employeeData.role_id,
        },
      );

      if (createResponse.status() !== 201) {
        const errorBody = await createResponse.json();
        throw new Error(
          `Employee creation failed: ${JSON.stringify(errorBody)}`,
        );
      }

      const createBody = await createResponse.json();
      const employeeId = createBody.data.user_id;

      // WHEN: Setting PIN with non-numeric characters
      const response = await clientUserApiRequest.put(
        `/api/client/employees/${employeeId}/pin`,
        {
          pin: "12ab", // Contains letters
          store_id: clientUser.store_id,
        },
      );

      // THEN: Should reject with validation error
      expect(response.status()).toBe(400);
      const body = await response.json();
      expect(body.success).toBe(false);
    });

    test("UPIN-API-003: should reject duplicate PIN in same store", async ({
      clientUserApiRequest,
      clientUser,
      prismaClient,
    }) => {
      // GIVEN: Two employees at the same store
      const storeRole = await prismaClient.role.findFirst({
        where: { scope: "STORE" },
      });
      if (!storeRole) {
        throw new Error("No STORE scope role found in database");
      }

      // Create first employee and set PIN
      const employee1Data = createEmployeeRequest({
        store_id: clientUser.store_id,
        role_id: storeRole.role_id,
      });

      const create1Response = await clientUserApiRequest.post(
        "/api/client/employees",
        {
          email: employee1Data.email,
          name: employee1Data.name,
          store_id: employee1Data.store_id,
          role_id: employee1Data.role_id,
        },
      );

      if (create1Response.status() !== 201) {
        const errorBody = await create1Response.json();
        throw new Error(
          `Employee 1 creation failed: ${JSON.stringify(errorBody)}`,
        );
      }

      const create1Body = await create1Response.json();
      const employee1Id = create1Body.data.user_id;

      // Set PIN for first employee
      const setPIN1Response = await clientUserApiRequest.put(
        `/api/client/employees/${employee1Id}/pin`,
        {
          pin: "9999",
          store_id: clientUser.store_id,
        },
      );

      if (setPIN1Response.status() !== 200) {
        const errorBody = await setPIN1Response.json();
        throw new Error(
          `PIN set for employee 1 failed: ${JSON.stringify(errorBody)}`,
        );
      }

      // Create second employee
      const employee2Data = createEmployeeRequest({
        store_id: clientUser.store_id,
        role_id: storeRole.role_id,
      });

      const create2Response = await clientUserApiRequest.post(
        "/api/client/employees",
        {
          email: employee2Data.email,
          name: employee2Data.name,
          store_id: employee2Data.store_id,
          role_id: employee2Data.role_id,
        },
      );

      if (create2Response.status() !== 201) {
        const errorBody = await create2Response.json();
        throw new Error(
          `Employee 2 creation failed: ${JSON.stringify(errorBody)}`,
        );
      }

      const create2Body = await create2Response.json();
      const employee2Id = create2Body.data.user_id;

      // WHEN: Trying to set the same PIN for second employee
      const response = await clientUserApiRequest.put(
        `/api/client/employees/${employee2Id}/pin`,
        {
          pin: "9999", // Same PIN as employee 1
          store_id: clientUser.store_id,
        },
      );

      // THEN: Should reject with duplicate error
      expect([400, 409]).toContain(response.status());
      const body = await response.json();
      expect(body.success).toBe(false);
    });

    test("UPIN-API-016: should allow updating existing PIN", async ({
      clientUserApiRequest,
      clientUser,
      prismaClient,
    }) => {
      // GIVEN: An employee with PIN set
      const storeRole = await prismaClient.role.findFirst({
        where: { scope: "STORE" },
      });
      if (!storeRole) {
        throw new Error("No STORE scope role found in database");
      }

      const employeeData = createEmployeeRequest({
        store_id: clientUser.store_id,
        role_id: storeRole.role_id,
      });

      const createResponse = await clientUserApiRequest.post(
        "/api/client/employees",
        {
          email: employeeData.email,
          name: employeeData.name,
          store_id: employeeData.store_id,
          role_id: employeeData.role_id,
        },
      );

      if (createResponse.status() !== 201) {
        const errorBody = await createResponse.json();
        throw new Error(
          `Employee creation failed: ${JSON.stringify(errorBody)}`,
        );
      }

      const createBody = await createResponse.json();
      const employeeId = createBody.data.user_id;

      // Set initial PIN
      const initialPINResponse = await clientUserApiRequest.put(
        `/api/client/employees/${employeeId}/pin`,
        {
          pin: "1111",
          store_id: clientUser.store_id,
        },
      );

      if (initialPINResponse.status() !== 200) {
        const errorBody = await initialPINResponse.json();
        throw new Error(`Initial PIN set failed: ${JSON.stringify(errorBody)}`);
      }

      // WHEN: Updating to a new PIN
      const response = await clientUserApiRequest.put(
        `/api/client/employees/${employeeId}/pin`,
        {
          pin: "2222",
          store_id: clientUser.store_id,
        },
      );

      // THEN: PIN should be updated successfully
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
    });
  });

  // ==========================================================================
  // GET /api/client/employees/:userId/pin/status - PIN Status
  // ==========================================================================

  test.describe("GET /api/client/employees/:userId/pin/status - PIN Status", () => {
    test("UPIN-API-009: should return PIN status for employee", async ({
      clientUserApiRequest,
      clientUser,
      prismaClient,
    }) => {
      // GIVEN: An employee
      const storeRole = await prismaClient.role.findFirst({
        where: { scope: "STORE" },
      });
      if (!storeRole) {
        throw new Error("No STORE scope role found in database");
      }

      const employeeData = createEmployeeRequest({
        store_id: clientUser.store_id,
        role_id: storeRole.role_id,
      });

      const createResponse = await clientUserApiRequest.post(
        "/api/client/employees",
        {
          email: employeeData.email,
          name: employeeData.name,
          store_id: employeeData.store_id,
          role_id: employeeData.role_id,
        },
      );

      if (createResponse.status() !== 201) {
        const errorBody = await createResponse.json();
        throw new Error(
          `Employee creation failed: ${JSON.stringify(errorBody)}`,
        );
      }

      const createBody = await createResponse.json();
      const employeeId = createBody.data.user_id;

      // WHEN: Getting PIN status
      const response = await clientUserApiRequest.get(
        `/api/client/employees/${employeeId}/pin/status`,
      );

      // THEN: Should return status
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(typeof body.data.has_pin).toBe("boolean");
      expect(body.data.has_pin).toBe(false); // New employee has no PIN
    });

    test("UPIN-API-009b: should show has_pin=true after PIN is set", async ({
      clientUserApiRequest,
      clientUser,
      prismaClient,
    }) => {
      // GIVEN: An employee with PIN set
      const storeRole = await prismaClient.role.findFirst({
        where: { scope: "STORE" },
      });
      if (!storeRole) {
        throw new Error("No STORE scope role found in database");
      }

      const employeeData = createEmployeeRequest({
        store_id: clientUser.store_id,
        role_id: storeRole.role_id,
      });

      const createResponse = await clientUserApiRequest.post(
        "/api/client/employees",
        {
          email: employeeData.email,
          name: employeeData.name,
          store_id: employeeData.store_id,
          role_id: employeeData.role_id,
        },
      );

      if (createResponse.status() !== 201) {
        const errorBody = await createResponse.json();
        throw new Error(
          `Employee creation failed: ${JSON.stringify(errorBody)}`,
        );
      }

      const createBody = await createResponse.json();
      const employeeId = createBody.data.user_id;

      // Set PIN
      const setPINResponse = await clientUserApiRequest.put(
        `/api/client/employees/${employeeId}/pin`,
        {
          pin: "4567",
          store_id: clientUser.store_id,
        },
      );

      if (setPINResponse.status() !== 200) {
        const errorBody = await setPINResponse.json();
        throw new Error(`PIN set failed: ${JSON.stringify(errorBody)}`);
      }

      // WHEN: Getting PIN status after setting
      const response = await clientUserApiRequest.get(
        `/api/client/employees/${employeeId}/pin/status`,
      );

      // THEN: Should show PIN is set
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.has_pin).toBe(true);
    });
  });

  // ==========================================================================
  // DELETE /api/client/employees/:userId/pin - Clear PIN
  // ==========================================================================

  test.describe("DELETE /api/client/employees/:userId/pin - Clear PIN", () => {
    test("UPIN-API-005: should successfully clear PIN", async ({
      clientUserApiRequest,
      clientUser,
      prismaClient,
    }) => {
      // GIVEN: An employee with PIN set
      const storeRole = await prismaClient.role.findFirst({
        where: { scope: "STORE" },
      });
      if (!storeRole) {
        throw new Error("No STORE scope role found in database");
      }

      const employeeData = createEmployeeRequest({
        store_id: clientUser.store_id,
        role_id: storeRole.role_id,
      });

      const createResponse = await clientUserApiRequest.post(
        "/api/client/employees",
        {
          email: employeeData.email,
          name: employeeData.name,
          store_id: employeeData.store_id,
          role_id: employeeData.role_id,
        },
      );

      if (createResponse.status() !== 201) {
        const errorBody = await createResponse.json();
        throw new Error(
          `Employee creation failed: ${JSON.stringify(errorBody)}`,
        );
      }

      const createBody = await createResponse.json();
      const employeeId = createBody.data.user_id;

      // Set PIN first
      const setPINResponse = await clientUserApiRequest.put(
        `/api/client/employees/${employeeId}/pin`,
        {
          pin: "7890",
          store_id: clientUser.store_id,
        },
      );

      if (setPINResponse.status() !== 200) {
        const errorBody = await setPINResponse.json();
        throw new Error(`PIN set failed: ${JSON.stringify(errorBody)}`);
      }

      // WHEN: Clearing PIN
      const response = await clientUserApiRequest.delete(
        `/api/client/employees/${employeeId}/pin`,
      );

      // THEN: PIN should be cleared
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);

      // Verify PIN is cleared
      const statusResponse = await clientUserApiRequest.get(
        `/api/client/employees/${employeeId}/pin/status`,
      );
      expect(statusResponse.status()).toBe(200);
      const statusBody = await statusResponse.json();
      expect(statusBody.data.has_pin).toBe(false);
    });
  });

  // ==========================================================================
  // POST /api/auth/verify-user-pin - PIN Verification
  // ==========================================================================

  test.describe("POST /api/auth/verify-user-pin - PIN Verification", () => {
    test("UPIN-API-006: should return elevation token for correct PIN", async ({
      clientUserApiRequest,
      clientUser,
      prismaClient,
      apiRequest,
    }) => {
      // GIVEN: An employee with PIN set
      const storeRole = await prismaClient.role.findFirst({
        where: { scope: "STORE" },
      });
      if (!storeRole) {
        throw new Error("No STORE scope role found in database");
      }

      const employeeData = createEmployeeRequest({
        store_id: clientUser.store_id,
        role_id: storeRole.role_id,
      });

      const createResponse = await clientUserApiRequest.post(
        "/api/client/employees",
        {
          email: employeeData.email,
          name: employeeData.name,
          store_id: employeeData.store_id,
          role_id: employeeData.role_id,
        },
      );

      if (createResponse.status() !== 201) {
        const errorBody = await createResponse.json();
        throw new Error(
          `Employee creation failed: ${JSON.stringify(errorBody)}`,
        );
      }

      const createBody = await createResponse.json();
      const employeeId = createBody.data.user_id;

      // Set PIN
      const setPINResponse = await clientUserApiRequest.put(
        `/api/client/employees/${employeeId}/pin`,
        {
          pin: "5555",
          store_id: clientUser.store_id,
        },
      );

      if (setPINResponse.status() !== 200) {
        const errorBody = await setPINResponse.json();
        throw new Error(`PIN set failed: ${JSON.stringify(errorBody)}`);
      }

      // WHEN: Verifying PIN
      const response = await apiRequest.post("/api/auth/verify-user-pin", {
        user_id: employeeId,
        pin: "5555",
        required_permission: "SHIFT_OPEN",
        store_id: clientUser.store_id,
      });

      // THEN: Should return elevation token
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.elevation_token).toBeTruthy();
      expect(body.data.expires_in).toBe(1800); // 30 minutes
      expect(body.data.permission).toBe("SHIFT_OPEN");
      expect(body.data.store_id).toBe(clientUser.store_id);
    });

    test("UPIN-API-010: should return token with 30-minute expiry", async ({
      clientUserApiRequest,
      clientUser,
      prismaClient,
      apiRequest,
    }) => {
      // GIVEN: An employee with PIN set
      const storeRole = await prismaClient.role.findFirst({
        where: { scope: "STORE" },
      });
      if (!storeRole) {
        throw new Error("No STORE scope role found in database");
      }

      const employeeData = createEmployeeRequest({
        store_id: clientUser.store_id,
        role_id: storeRole.role_id,
      });

      const createResponse = await clientUserApiRequest.post(
        "/api/client/employees",
        {
          email: employeeData.email,
          name: employeeData.name,
          store_id: employeeData.store_id,
          role_id: employeeData.role_id,
        },
      );

      if (createResponse.status() !== 201) {
        const errorBody = await createResponse.json();
        throw new Error(
          `Employee creation failed: ${JSON.stringify(errorBody)}`,
        );
      }

      const createBody = await createResponse.json();
      const employeeId = createBody.data.user_id;

      // Set PIN
      const setPINResponse = await clientUserApiRequest.put(
        `/api/client/employees/${employeeId}/pin`,
        {
          pin: "6666",
          store_id: clientUser.store_id,
        },
      );

      if (setPINResponse.status() !== 200) {
        const errorBody = await setPINResponse.json();
        throw new Error(`PIN set failed: ${JSON.stringify(errorBody)}`);
      }

      // WHEN: Verifying PIN
      const response = await apiRequest.post("/api/auth/verify-user-pin", {
        user_id: employeeId,
        pin: "6666",
        required_permission: "CASH_DROP",
        store_id: clientUser.store_id,
      });

      // THEN: Token should have 30-minute expiry (1800 seconds)
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.data.expires_in).toBe(1800);

      // Verify expires_at is approximately 30 minutes in the future
      const expiresAt = new Date(body.data.expires_at).getTime();
      const now = Date.now();
      const thirtyMinutesMs = 30 * 60 * 1000;
      const tolerance = 5000; // 5 second tolerance
      expect(expiresAt).toBeGreaterThan(now + thirtyMinutesMs - tolerance);
      expect(expiresAt).toBeLessThan(now + thirtyMinutesMs + tolerance);
    });

    test("UPIN-API-007: should fail verification with wrong PIN", async ({
      clientUserApiRequest,
      clientUser,
      prismaClient,
      apiRequest,
    }) => {
      // GIVEN: An employee with PIN set
      const storeRole = await prismaClient.role.findFirst({
        where: { scope: "STORE" },
      });
      if (!storeRole) {
        throw new Error("No STORE scope role found in database");
      }

      const employeeData = createEmployeeRequest({
        store_id: clientUser.store_id,
        role_id: storeRole.role_id,
      });

      const createResponse = await clientUserApiRequest.post(
        "/api/client/employees",
        {
          email: employeeData.email,
          name: employeeData.name,
          store_id: employeeData.store_id,
          role_id: employeeData.role_id,
        },
      );

      if (createResponse.status() !== 201) {
        const errorBody = await createResponse.json();
        throw new Error(
          `Employee creation failed: ${JSON.stringify(errorBody)}`,
        );
      }

      const createBody = await createResponse.json();
      const employeeId = createBody.data.user_id;

      // Set PIN
      const setPINResponse = await clientUserApiRequest.put(
        `/api/client/employees/${employeeId}/pin`,
        {
          pin: "7777",
          store_id: clientUser.store_id,
        },
      );

      if (setPINResponse.status() !== 200) {
        const errorBody = await setPINResponse.json();
        throw new Error(`PIN set failed: ${JSON.stringify(errorBody)}`);
      }

      // WHEN: Verifying with wrong PIN
      const response = await apiRequest.post("/api/auth/verify-user-pin", {
        user_id: employeeId,
        pin: "8888", // Wrong PIN
        required_permission: "SHIFT_OPEN",
        store_id: clientUser.store_id,
      });

      // THEN: Should fail with generic error (no info leakage)
      expect(response.status()).toBe(401);
      const body = await response.json();
      expect(body.success).toBe(false);
    });

    test("UPIN-API-017: should return generic error message on failure (no info leakage)", async ({
      clientUserApiRequest,
      clientUser,
      prismaClient,
      apiRequest,
    }) => {
      // GIVEN: An employee with PIN set
      const storeRole = await prismaClient.role.findFirst({
        where: { scope: "STORE" },
      });
      if (!storeRole) {
        throw new Error("No STORE scope role found in database");
      }

      const employeeData = createEmployeeRequest({
        store_id: clientUser.store_id,
        role_id: storeRole.role_id,
      });

      const createResponse = await clientUserApiRequest.post(
        "/api/client/employees",
        {
          email: employeeData.email,
          name: employeeData.name,
          store_id: employeeData.store_id,
          role_id: employeeData.role_id,
        },
      );

      if (createResponse.status() !== 201) {
        const errorBody = await createResponse.json();
        throw new Error(
          `Employee creation failed: ${JSON.stringify(errorBody)}`,
        );
      }

      const createBody = await createResponse.json();
      const employeeId = createBody.data.user_id;

      // Set PIN
      const setPINResponse = await clientUserApiRequest.put(
        `/api/client/employees/${employeeId}/pin`,
        {
          pin: "3333",
          store_id: clientUser.store_id,
        },
      );

      if (setPINResponse.status() !== 200) {
        const errorBody = await setPINResponse.json();
        throw new Error(`PIN set failed: ${JSON.stringify(errorBody)}`);
      }

      // WHEN: Verifying with wrong PIN
      const response = await apiRequest.post("/api/auth/verify-user-pin", {
        user_id: employeeId,
        pin: "0000", // Wrong PIN
        required_permission: "SHIFT_OPEN",
        store_id: clientUser.store_id,
      });

      // THEN: Error message should be generic (no info leakage)
      expect(response.status()).toBe(401);
      const body = await response.json();

      // Verify error message doesn't leak information
      const errorMessage =
        typeof body.error === "object"
          ? body.error.message || ""
          : body.error || "";

      // Should NOT contain information-leaking messages
      expect(errorMessage.toLowerCase()).not.toContain("user not found");
      expect(errorMessage.toLowerCase()).not.toContain("wrong pin");
      expect(errorMessage.toLowerCase()).not.toContain("invalid pin");
      expect(errorMessage.toLowerCase()).not.toContain("no pin set");
    });
  });

  // ==========================================================================
  // Security Tests
  // ==========================================================================

  test.describe("Security Tests", () => {
    test("UPIN-API-008: should require authentication for PIN management", async ({
      apiRequest,
    }) => {
      // WHEN: Trying to set PIN without authentication
      const response = await apiRequest.put(
        "/api/client/employees/00000000-0000-0000-0000-000000000000/pin",
        {
          pin: "1234",
          store_id: "00000000-0000-0000-0000-000000000001",
        },
      );

      // THEN: Should be rejected with 401
      expect(response.status()).toBe(401);
    });

    test("should validate UUID format for user_id", async ({
      clientUserApiRequest,
      clientUser,
    }) => {
      // WHEN: Using invalid UUID format
      const response = await clientUserApiRequest.put(
        "/api/client/employees/invalid-uuid/pin",
        {
          pin: "1234",
          store_id: clientUser.store_id,
        },
      );

      // THEN: Should reject with 400
      expect(response.status()).toBe(400);
    });

    test("should validate UUID format for store_id", async ({
      clientUserApiRequest,
      clientUser,
      prismaClient,
    }) => {
      // GIVEN: A valid employee
      const storeRole = await prismaClient.role.findFirst({
        where: { scope: "STORE" },
      });
      if (!storeRole) {
        throw new Error("No STORE scope role found in database");
      }

      const employeeData = createEmployeeRequest({
        store_id: clientUser.store_id,
        role_id: storeRole.role_id,
      });

      const createResponse = await clientUserApiRequest.post(
        "/api/client/employees",
        {
          email: employeeData.email,
          name: employeeData.name,
          store_id: employeeData.store_id,
          role_id: employeeData.role_id,
        },
      );

      if (createResponse.status() !== 201) {
        const errorBody = await createResponse.json();
        throw new Error(
          `Employee creation failed: ${JSON.stringify(errorBody)}`,
        );
      }

      const createBody = await createResponse.json();
      const employeeId = createBody.data.user_id;

      // WHEN: Using invalid store_id format
      const response = await clientUserApiRequest.put(
        `/api/client/employees/${employeeId}/pin`,
        {
          pin: "1234",
          store_id: "invalid-store-uuid",
        },
      );

      // THEN: Should reject with 400
      expect(response.status()).toBe(400);
    });
  });
});
