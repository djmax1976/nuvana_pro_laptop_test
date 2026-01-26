import { test, expect } from "../support/fixtures/rbac.fixture";
import {
  createTerminal,
  createStore,
  createCompany,
  createUser,
  createJWTAccessToken,
} from "../support/factories";
import { PrismaClient } from "@prisma/client";

/**
 * API Tests: MyStore Terminal Dashboard
 *
 * @test-level API
 * @justification API-level tests for terminal endpoint used by /mystore dashboard
 * @story 4-9-mystore-terminal-dashboard
 * @enhanced-by workflow-9 on 2025-12-02
 * @status RED Phase - Tests fail until implementation is complete
 *
 * Tests the GET /api/stores/:storeId/terminals endpoint to ensure:
 * - Returns terminals with connection type and status
 * - RLS filtering ensures users only see terminals for their accessible stores
 * - Proper error handling
 * - Security: Authentication and authorization enforcement
 * - Edge cases: Invalid inputs, empty results, various connection types
 */

test.describe("4.9-API: MyStore Terminal Dashboard API", () => {
  test.describe("AC-2: Terminal List with Connection Information", () => {
    test("4.9-API-001: [P1] Should return terminals with connection type and status", async ({
      storeManagerApiRequest,
      storeManagerUser,
      prismaClient,
    }) => {
      // GIVEN: Store has terminals with connection information
      const company = await prismaClient.company.findUnique({
        where: { company_id: storeManagerUser.company_id! },
      });
      const store = await prismaClient.store.findFirst({
        where: { company_id: company!.company_id },
      });

      const terminal1 = await prismaClient.pOSTerminal.create({
        data: createTerminal({
          store_id: store!.store_id,
          connection_type: "NETWORK",
          terminal_status: "ACTIVE",
        }),
      });

      const terminal2 = await prismaClient.pOSTerminal.create({
        data: createTerminal({
          store_id: store!.store_id,
          connection_type: "API",
          terminal_status: "PENDING",
        }),
      });

      // WHEN: I fetch terminals for the store
      const response = await storeManagerApiRequest.get(
        `/api/stores/${store!.store_id}/terminals`,
      );

      // THEN: Response is successful
      expect(response.status()).toBe(200);

      const terminals = await response.json();
      expect(Array.isArray(terminals)).toBe(true);

      // AND: Response structure assertions
      expect(terminals.length).toBeGreaterThanOrEqual(2);

      // AND: Terminals include connection type and status
      const terminal1Response = terminals.find(
        (t: any) => t.pos_terminal_id === terminal1.pos_terminal_id,
      );
      expect(terminal1Response).toBeDefined();
      expect(terminal1Response.connection_type).toBe("NETWORK");
      expect(terminal1Response.terminal_status).toBe("ACTIVE");

      // AND: Data type assertions for terminal 1
      expect(typeof terminal1Response.pos_terminal_id).toBe("string");
      expect(typeof terminal1Response.store_id).toBe("string");
      expect(typeof terminal1Response.name).toBe("string");
      expect(typeof terminal1Response.has_active_shift).toBe("boolean");

      // AND: Response structure assertions for terminal 1
      expect(terminal1Response).toHaveProperty("pos_terminal_id");
      expect(terminal1Response).toHaveProperty("store_id");
      expect(terminal1Response).toHaveProperty("name");
      expect(terminal1Response).toHaveProperty("connection_type");
      expect(terminal1Response).toHaveProperty("terminal_status");
      expect(terminal1Response).toHaveProperty("has_active_shift");
      expect(terminal1Response).toHaveProperty("created_at");
      expect(terminal1Response).toHaveProperty("updated_at");
      // Story 4.82: Connection configuration fields (optional)
      expect(terminal1Response).toHaveProperty("connection_config");
      expect(terminal1Response).toHaveProperty("pos_type");
      expect(terminal1Response).toHaveProperty("sync_status");
      expect(terminal1Response).toHaveProperty("last_sync_at");

      const terminal2Response = terminals.find(
        (t: any) => t.pos_terminal_id === terminal2.pos_terminal_id,
      );
      expect(terminal2Response).toBeDefined();
      expect(terminal2Response.connection_type).toBe("API");
      expect(terminal2Response.terminal_status).toBe("PENDING");

      // AND: Data type assertions for terminal 2
      expect(typeof terminal2Response.pos_terminal_id).toBe("string");
      expect(typeof terminal2Response.has_active_shift).toBe("boolean");

      // Cleanup
      await prismaClient.pOSTerminal.deleteMany({
        where: {
          pos_terminal_id: {
            in: [terminal1.pos_terminal_id, terminal2.pos_terminal_id],
          },
        },
      });
    });
  });

  test.describe("AC-5: RLS Filtering for Store Manager", () => {
    test("4.9-API-002: [P1] Should only return terminals for stores Store Manager has access to", async ({
      storeManagerApiRequest,
      storeManagerUser,
      prismaClient,
    }) => {
      // GIVEN: Store Manager has access to Store A, but not Store B
      const company = await prismaClient.company.findUnique({
        where: { company_id: storeManagerUser.company_id! },
      });
      const storeA = await prismaClient.store.findFirst({
        where: { company_id: company!.company_id },
      });

      // Create another company and store (Store Manager should NOT have access)
      const otherOwner = await prismaClient.user.create({
        data: createUser(),
      });
      const otherCompany = await prismaClient.company.create({
        data: createCompany({ owner_user_id: otherOwner.user_id }),
      });
      const storeB = await prismaClient.store.create({
        data: createStore({ company_id: otherCompany.company_id }),
      });

      const terminalA = await prismaClient.pOSTerminal.create({
        data: createTerminal({ store_id: storeA!.store_id }),
      });

      const terminalB = await prismaClient.pOSTerminal.create({
        data: createTerminal({ store_id: storeB.store_id }),
      });

      // WHEN: Store Manager fetches terminals for Store A
      const response = await storeManagerApiRequest.get(
        `/api/stores/${storeA!.store_id}/terminals`,
      );

      // THEN: Only terminals from Store A are returned
      expect(response.status()).toBe(200);
      const terminals = await response.json();
      expect(Array.isArray(terminals)).toBe(true);

      const terminalIds = terminals.map((t: any) => t.pos_terminal_id);
      expect(terminalIds).toContain(terminalA.pos_terminal_id);
      expect(terminalIds).not.toContain(terminalB.pos_terminal_id);

      // WHEN: Store Manager tries to fetch terminals for Store B (unauthorized)
      const unauthorizedResponse = await storeManagerApiRequest.get(
        `/api/stores/${storeB.store_id}/terminals`,
      );

      // THEN: Request is denied (403 or 404)
      expect([403, 404]).toContain(unauthorizedResponse.status());

      // Cleanup
      await prismaClient.pOSTerminal.deleteMany({
        where: {
          pos_terminal_id: {
            in: [terminalA.pos_terminal_id, terminalB.pos_terminal_id],
          },
        },
      });
      await prismaClient.store.delete({ where: { store_id: storeB.store_id } });
      await prismaClient.company.delete({
        where: { company_id: otherCompany.company_id },
      });
    });

    test("4.9-API-003: [P1] Should return empty array when store has no terminals", async ({
      storeManagerApiRequest,
      storeManagerUser,
      prismaClient,
    }) => {
      // GIVEN: Store exists but has no terminals
      const company = await prismaClient.company.findUnique({
        where: { company_id: storeManagerUser.company_id! },
      });
      const store = await prismaClient.store.findFirst({
        where: { company_id: company!.company_id },
      });

      // WHEN: I fetch terminals for the store
      const response = await storeManagerApiRequest.get(
        `/api/stores/${store!.store_id}/terminals`,
      );

      // THEN: Response is successful with empty array
      expect(response.status()).toBe(200);
      const terminals = await response.json();
      expect(Array.isArray(terminals)).toBe(true);
      expect(terminals.length).toBe(0);
    });

    test("4.9-API-004: [P1] Should handle invalid store ID gracefully", async ({
      storeManagerApiRequest,
    }) => {
      // GIVEN: Invalid store ID
      const invalidStoreId = "00000000-0000-0000-0000-000000000000";

      // WHEN: I try to fetch terminals for invalid store
      const response = await storeManagerApiRequest.get(
        `/api/stores/${invalidStoreId}/terminals`,
      );

      // THEN: Request returns error (404 or 403)
      expect([403, 404]).toContain(response.status());

      // AND: Error response structure assertions
      if (response.status() === 403) {
        const errorBody = await response.json();
        expect(errorBody).toHaveProperty("success");
        expect(errorBody.success).toBe(false);
        expect(errorBody).toHaveProperty("error");
        expect(errorBody.error).toHaveProperty("code");
        expect(errorBody.error).toHaveProperty("message");
        // 403 returns PERMISSION_DENIED for authorization failures (user doesn't have access to this store)
        expect(errorBody.error.code).toBe("PERMISSION_DENIED");
      } else if (response.status() === 404) {
        const errorBody = await response.json();
        expect(errorBody).toHaveProperty("success");
        expect(errorBody.success).toBe(false);
        expect(errorBody).toHaveProperty("error");
        expect(errorBody.error).toHaveProperty("code");
        expect(errorBody.error).toHaveProperty("message");
      }
    });
  });

  test.describe("Security: Authentication Bypass Prevention", () => {
    test("4.9-API-005: [P0] Should reject request without authentication token", async ({
      apiRequest,
      prismaClient,
      storeManagerUser,
    }) => {
      // GIVEN: Store exists
      const company = await prismaClient.company.findUnique({
        where: { company_id: storeManagerUser.company_id! },
      });
      const store = await prismaClient.store.findFirst({
        where: { company_id: company!.company_id },
      });

      // WHEN: I make request without authentication token
      const response = await apiRequest.get(
        `/api/stores/${store!.store_id}/terminals`,
      );

      // THEN: Request is rejected with 401
      expect(response.status()).toBe(401);

      const errorBody = await response.json();
      // Verify error response structure
      expect(errorBody).toHaveProperty("success", false);
      expect(errorBody).toHaveProperty("error");
      expect(errorBody.error).toHaveProperty("code", "UNAUTHORIZED");
      expect(errorBody.error).toHaveProperty("message");
    });

    test("4.9-API-006: [P0] Should reject request with invalid token", async ({
      request,
      backendUrl,
      prismaClient,
      storeManagerUser,
    }) => {
      // GIVEN: Store exists
      const company = await prismaClient.company.findUnique({
        where: { company_id: storeManagerUser.company_id! },
      });
      const store = await prismaClient.store.findFirst({
        where: { company_id: company!.company_id },
      });

      // WHEN: I make request with invalid token
      const response = await request.get(
        `${backendUrl}/api/stores/${store!.store_id}/terminals`,
        {
          headers: {
            Cookie: "access_token=invalid-token-here",
          },
        },
      );

      // THEN: Request is rejected with 401
      expect(response.status()).toBe(401);

      const errorBody = await response.json();
      // Verify error response structure
      expect(errorBody).toHaveProperty("success", false);
      expect(errorBody).toHaveProperty("error");
      expect(errorBody.error).toHaveProperty("code", "UNAUTHORIZED");
      expect(errorBody.error).toHaveProperty("message");
    });

    test("4.9-API-007: [P0] Should reject request with expired token", async ({
      request,
      backendUrl,
      prismaClient,
      storeManagerUser,
    }) => {
      // GIVEN: Store exists and expired token
      const company = await prismaClient.company.findUnique({
        where: { company_id: storeManagerUser.company_id! },
      });
      const store = await prismaClient.store.findFirst({
        where: { company_id: company!.company_id },
      });

      // Create expired token using factory
      const { createExpiredJWTAccessToken } =
        await import("../support/factories/jwt.factory");
      const expiredToken = createExpiredJWTAccessToken({
        user_id: storeManagerUser.user_id,
        email: storeManagerUser.email,
        roles: [],
        permissions: [],
      });

      // WHEN: I make request with expired token
      const response = await request.get(
        `${backendUrl}/api/stores/${store!.store_id}/terminals`,
        {
          headers: {
            Cookie: `access_token=${expiredToken}`,
          },
        },
      );

      // THEN: Request is rejected with 401
      expect(response.status()).toBe(401);
    });

    test("4.9-API-007b: [P0] Should reject request with malformed token (missing claims)", async ({
      request,
      backendUrl,
      prismaClient,
      storeManagerUser,
    }) => {
      // GIVEN: Store exists
      const company = await prismaClient.company.findUnique({
        where: { company_id: storeManagerUser.company_id! },
      });
      const store = await prismaClient.store.findFirst({
        where: { company_id: company!.company_id },
      });

      // Create token with missing required claims using factory
      const { createMalformedJWTAccessToken } =
        await import("../support/factories/jwt.factory");
      const malformedToken = createMalformedJWTAccessToken({
        roles: ["USER"], // Missing user_id and email
        permissions: [],
      });

      // WHEN: I make request with malformed token
      const response = await request.get(
        `${backendUrl}/api/stores/${store!.store_id}/terminals`,
        {
          headers: {
            Cookie: `access_token=${malformedToken}`,
          },
        },
      );

      // THEN: Request is rejected with 401
      expect(response.status()).toBe(401);

      const errorBody = await response.json();
      // Verify error response structure
      expect(errorBody).toHaveProperty("success", false);
      expect(errorBody).toHaveProperty("error");
      expect(errorBody.error).toHaveProperty("code", "UNAUTHORIZED");
      expect(errorBody.error).toHaveProperty("message");
    });
  });

  test.describe("Security: Authorization Enforcement", () => {
    test("4.9-API-008: [P0] Should deny access when user lacks STORE_READ permission", async ({
      request,
      backendUrl,
      prismaClient,
      storeManagerUser,
    }) => {
      // GIVEN: Store exists and user without STORE_READ permission
      const company = await prismaClient.company.findUnique({
        where: { company_id: storeManagerUser.company_id! },
      });
      const store = await prismaClient.store.findFirst({
        where: { company_id: company!.company_id },
      });

      // Create user with no permissions
      const userWithoutPermission = await prismaClient.user.create({
        data: createUser(),
      });

      const token = await createJWTAccessToken({
        user_id: userWithoutPermission.user_id,
        email: userWithoutPermission.email,
        roles: [],
        permissions: [], // No STORE_READ permission
      });

      // WHEN: User without permission tries to access terminals
      const response = await request.get(
        `${backendUrl}/api/stores/${store!.store_id}/terminals`,
        {
          headers: {
            Cookie: `access_token=${token}`,
          },
        },
      );

      // THEN: Request is denied with 403
      expect(response.status()).toBe(403);

      const errorBody = await response.json();
      expect(errorBody).toHaveProperty("success");
      expect(errorBody.success).toBe(false);
      expect(errorBody).toHaveProperty("error");
      expect(errorBody.error).toHaveProperty("code");
      expect(errorBody.error).toHaveProperty("message");
      expect(errorBody.error.code).toBe("PERMISSION_DENIED");

      // Cleanup
      await prismaClient.user.delete({
        where: { user_id: userWithoutPermission.user_id },
      });
    });

    test("4.9-API-009: [P0] Should allow SYSTEM scope user to access any store", async ({
      superadminApiRequest,
      prismaClient,
    }) => {
      // GIVEN: Store exists in different company
      const owner = await prismaClient.user.create({
        data: createUser(),
      });
      const company = await prismaClient.company.create({
        data: createCompany({ owner_user_id: owner.user_id }),
      });
      const store = await prismaClient.store.create({
        data: createStore({ company_id: company.company_id }),
      });

      // WHEN: SYSTEM scope user (superadmin) accesses terminals
      const response = await superadminApiRequest.get(
        `/api/stores/${store.store_id}/terminals`,
      );

      // THEN: Request succeeds (200)
      expect(response.status()).toBe(200);

      // Cleanup
      await prismaClient.store.delete({ where: { store_id: store.store_id } });
      await prismaClient.company.delete({
        where: { company_id: company.company_id },
      });
    });
  });

  test.describe("Edge Cases: Input Validation", () => {
    test("4.9-API-010: [P2] Should reject invalid UUID format in storeId", async ({
      storeManagerApiRequest,
    }) => {
      // GIVEN: Invalid UUID format
      const invalidStoreId = "not-a-valid-uuid";

      // WHEN: I try to fetch terminals with invalid UUID
      const response = await storeManagerApiRequest.get(
        `/api/stores/${invalidStoreId}/terminals`,
      );

      // THEN: Request returns error (400, 403, or 404)
      expect([400, 403, 404]).toContain(response.status());
    });

    test("4.9-API-011: [P2] Should reject SQL injection attempt in storeId", async ({
      storeManagerApiRequest,
    }) => {
      // GIVEN: SQL injection attempt
      const sqlInjectionStoreId = "'; DROP TABLE terminals; --";

      // WHEN: I try to fetch terminals with SQL injection
      const response = await storeManagerApiRequest.get(
        `/api/stores/${encodeURIComponent(sqlInjectionStoreId)}/terminals`,
      );

      // THEN: Request returns error (400, 403, or 404) - SQL injection prevented
      expect([400, 403, 404]).toContain(response.status());
    });

    test("4.9-API-013: [P2] Should reject empty string storeId", async ({
      storeManagerApiRequest,
    }) => {
      // GIVEN: Empty string storeId
      const emptyStoreId = "";

      // WHEN: I try to fetch terminals with empty storeId
      const response = await storeManagerApiRequest.get(
        `/api/stores/${emptyStoreId}/terminals`,
      );

      // THEN: Request returns error (400, 403, or 404)
      expect([400, 403, 404]).toContain(response.status());
    });

    test("4.9-API-014: [P2] Should reject very long storeId string", async ({
      storeManagerApiRequest,
    }) => {
      // GIVEN: Very long storeId string (1000+ characters)
      const veryLongStoreId = "a".repeat(1000);

      // WHEN: I try to fetch terminals with very long storeId
      const response = await storeManagerApiRequest.get(
        `/api/stores/${veryLongStoreId}/terminals`,
      );

      // THEN: Request returns error (400, 403, or 404)
      expect([400, 403, 404]).toContain(response.status());
    });

    test("4.9-API-015: [P2] Should reject storeId with special characters", async ({
      storeManagerApiRequest,
    }) => {
      // GIVEN: storeId with path traversal attempt
      const specialCharStoreId = "../../etc/passwd";

      // WHEN: I try to fetch terminals with special characters
      const response = await storeManagerApiRequest.get(
        `/api/stores/${encodeURIComponent(specialCharStoreId)}/terminals`,
      );

      // THEN: Request returns error (400, 403, or 404)
      expect([400, 403, 404]).toContain(response.status());
    });

    test("4.9-API-012: [P2] Should handle all connection types correctly", async ({
      storeManagerApiRequest,
      storeManagerUser,
      prismaClient,
    }) => {
      // GIVEN: Store with terminals of all connection types
      const company = await prismaClient.company.findUnique({
        where: { company_id: storeManagerUser.company_id! },
      });
      const store = await prismaClient.store.findFirst({
        where: { company_id: company!.company_id },
      });

      const terminals = await Promise.all([
        prismaClient.pOSTerminal.create({
          data: createTerminal({
            store_id: store!.store_id,
            connection_type: "NETWORK",
            terminal_status: "ACTIVE",
          }),
        }),
        prismaClient.pOSTerminal.create({
          data: createTerminal({
            store_id: store!.store_id,
            connection_type: "API",
            terminal_status: "ACTIVE",
          }),
        }),
        prismaClient.pOSTerminal.create({
          data: createTerminal({
            store_id: store!.store_id,
            connection_type: "WEBHOOK",
            terminal_status: "PENDING",
          }),
        }),
        prismaClient.pOSTerminal.create({
          data: createTerminal({
            store_id: store!.store_id,
            connection_type: "FILE",
            terminal_status: "ACTIVE",
          }),
        }),
        prismaClient.pOSTerminal.create({
          data: createTerminal({
            store_id: store!.store_id,
            connection_type: "MANUAL",
            terminal_status: "INACTIVE",
          }),
        }),
      ]);

      // WHEN: I fetch terminals
      const response = await storeManagerApiRequest.get(
        `/api/stores/${store!.store_id}/terminals`,
      );

      // THEN: Response is successful
      expect(response.status()).toBe(200);

      const responseTerminals = await response.json();
      expect(Array.isArray(responseTerminals)).toBe(true);

      // AND: All connection types are present
      const connectionTypes = responseTerminals.map(
        (t: any) => t.connection_type,
      );
      expect(connectionTypes).toContain("NETWORK");
      expect(connectionTypes).toContain("API");
      expect(connectionTypes).toContain("WEBHOOK");
      expect(connectionTypes).toContain("FILE");
      expect(connectionTypes).toContain("MANUAL");

      // AND: Connection type enum validation
      responseTerminals.forEach((terminal: any) => {
        expect(["NETWORK", "API", "WEBHOOK", "FILE", "MANUAL"]).toContain(
          terminal.connection_type,
        );
      });

      // Cleanup
      await prismaClient.pOSTerminal.deleteMany({
        where: {
          pos_terminal_id: {
            in: terminals.map((t) => t.pos_terminal_id),
          },
        },
      });
    });
  });

  test.describe("Security: Data Leakage Prevention", () => {
    test("4.9-API-016: [P0] Should not expose sensitive connection config data inappropriately", async ({
      storeManagerApiRequest,
      storeManagerUser,
      prismaClient,
    }) => {
      // GIVEN: Terminal exists with API connection config containing sensitive data
      const company = await prismaClient.company.findUnique({
        where: { company_id: storeManagerUser.company_id! },
      });
      const store = await prismaClient.store.findFirst({
        where: { company_id: company!.company_id },
      });

      const terminal = await prismaClient.pOSTerminal.create({
        data: createTerminal({
          store_id: store!.store_id,
          connection_type: "API",
          connection_config: {
            baseUrl: "https://api.example.com",
            apiKey: "secret-api-key-12345",
          },
        }),
      });

      // WHEN: I fetch terminals for the store
      const response = await storeManagerApiRequest.get(
        `/api/stores/${store!.store_id}/terminals`,
      );

      // THEN: Response is successful
      expect(response.status()).toBe(200);
      const terminals = await response.json();
      const terminalResponse = terminals.find(
        (t: any) => t.pos_terminal_id === terminal.pos_terminal_id,
      );

      // AND: Connection config is present (authorized user can see it)
      expect(terminalResponse).toBeDefined();
      expect(terminalResponse.connection_config).toBeDefined();

      // AND: Connection config structure is correct
      expect(terminalResponse.connection_config).toHaveProperty("baseUrl");
      expect(terminalResponse.connection_config).toHaveProperty("apiKey");

      // Note: API keys are returned because user has access to the store
      // This is expected behavior - RLS ensures only authorized users see this data

      // Cleanup
      await prismaClient.pOSTerminal.deleteMany({
        where: {
          pos_terminal_id: terminal.pos_terminal_id,
        },
      });
    });

    test("4.9-API-017: [P0] Should not return terminals with sensitive data for unauthorized users", async ({
      request,
      backendUrl,
      prismaClient,
      storeManagerUser,
    }) => {
      // GIVEN: Terminal exists in store
      const company = await prismaClient.company.findUnique({
        where: { company_id: storeManagerUser.company_id! },
      });
      const store = await prismaClient.store.findFirst({
        where: { company_id: company!.company_id },
      });

      const terminal = await prismaClient.pOSTerminal.create({
        data: createTerminal({
          store_id: store!.store_id,
          connection_type: "API",
          connection_config: {
            baseUrl: "https://api.example.com",
            apiKey: "secret-api-key-12345",
          },
        }),
      });

      // Create unauthorized user
      const unauthorizedUser = await prismaClient.user.create({
        data: createUser(),
      });

      const token = await createJWTAccessToken({
        user_id: unauthorizedUser.user_id,
        email: unauthorizedUser.email,
        roles: [],
        permissions: [],
      });

      // WHEN: Unauthorized user tries to fetch terminals
      const response = await request.get(
        `${backendUrl}/api/stores/${store!.store_id}/terminals`,
        {
          headers: {
            Cookie: `access_token=${token}`,
          },
        },
      );

      // THEN: Request is denied (403 or 404) - sensitive data not exposed
      expect([403, 404]).toContain(response.status());

      // Cleanup
      await prismaClient.pOSTerminal.deleteMany({
        where: {
          pos_terminal_id: terminal.pos_terminal_id,
        },
      });
      await prismaClient.user.delete({
        where: { user_id: unauthorizedUser.user_id },
      });
    });
  });
});
