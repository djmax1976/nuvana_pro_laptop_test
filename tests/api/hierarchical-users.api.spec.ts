import { test, expect } from "../support/fixtures/rbac.fixture";
import {
  createAdminUser,
  createUserRequest,
  createSystemScopeAssignment,
  createSupportScopeAssignment,
  createCompanyScopeAssignment,
  createStoreScopeAssignment,
} from "../support/factories/user-admin.factory";
import { createCompany, createStore, createUser } from "../support/factories";

/**
 * Hierarchical Users API Tests
 *
 * Tests for GET /api/admin/users/hierarchical endpoint:
 * - Returns users grouped by scope hierarchy
 * - Includes system_users (SYSTEM scope)
 * - Includes support_users (SUPPORT scope) - SEC-010 AUTHZ
 * - Includes client_owners with their companies and store users
 * - Validates meta totals match actual counts
 * - Only accessible by System Admin users
 *
 * Priority: P0 (Critical - User access control foundation)
 *
 * Traceability:
 * - SEC-010 AUTHZ: SUPPORT scope is distinct from SYSTEM scope
 * - Story: 2.8 - User and Role Management Dashboard
 */

test.describe("2.8-API: Hierarchical Users API", () => {
  test.describe("Basic Response Structure", () => {
    test("2.8-API-HIER-001: [P0] GET /api/admin/users/hierarchical - should return success response with data structure", async ({
      superadminApiRequest,
    }) => {
      // GIVEN: I am authenticated as a System Admin

      // WHEN: Requesting hierarchical users
      const response = await superadminApiRequest.get(
        "/api/admin/users/hierarchical",
      );

      // THEN: Success response with correct structure is returned
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty("system_users");
      expect(body.data).toHaveProperty("support_users");
      expect(body.data).toHaveProperty("client_owners");
      expect(body.data).toHaveProperty("meta");
    });

    test("2.8-API-HIER-002: [P0] GET /api/admin/users/hierarchical - should return meta with all totals", async ({
      superadminApiRequest,
    }) => {
      // GIVEN: I am authenticated as a System Admin

      // WHEN: Requesting hierarchical users
      const response = await superadminApiRequest.get(
        "/api/admin/users/hierarchical",
      );

      // THEN: Meta includes all total counts
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.data.meta).toHaveProperty("total_system_users");
      expect(body.data.meta).toHaveProperty("total_support_users");
      expect(body.data.meta).toHaveProperty("total_client_owners");
      expect(body.data.meta).toHaveProperty("total_companies");
      expect(body.data.meta).toHaveProperty("total_stores");
      expect(body.data.meta).toHaveProperty("total_store_users");

      // AND: All totals are numbers
      expect(typeof body.data.meta.total_system_users).toBe("number");
      expect(typeof body.data.meta.total_support_users).toBe("number");
      expect(typeof body.data.meta.total_client_owners).toBe("number");
    });

    test("2.8-API-HIER-003: [P0] GET /api/admin/users/hierarchical - should return arrays for user groups", async ({
      superadminApiRequest,
    }) => {
      // GIVEN: I am authenticated as a System Admin

      // WHEN: Requesting hierarchical users
      const response = await superadminApiRequest.get(
        "/api/admin/users/hierarchical",
      );

      // THEN: All user groups are arrays
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(Array.isArray(body.data.system_users)).toBe(true);
      expect(Array.isArray(body.data.support_users)).toBe(true);
      expect(Array.isArray(body.data.client_owners)).toBe(true);
    });
  });

  test.describe("System Users Section", () => {
    test("2.8-API-HIER-010: [P0] GET /api/admin/users/hierarchical - should include SYSTEM scope users in system_users", async ({
      superadminApiRequest,
      prismaClient,
    }) => {
      // GIVEN: A user with SYSTEM scope role exists
      const systemRole = await prismaClient.role.findFirst({
        where: { scope: "SYSTEM" },
      });
      expect(systemRole).not.toBeNull();

      const userData = createAdminUser();
      const user = await prismaClient.user.create({ data: userData });
      await prismaClient.userRole.create({
        data: {
          user_id: user.user_id,
          role_id: systemRole!.role_id,
        },
      });

      // WHEN: Requesting hierarchical users
      const response = await superadminApiRequest.get(
        "/api/admin/users/hierarchical",
      );

      // THEN: User is in system_users array
      expect(response.status()).toBe(200);
      const body = await response.json();
      const systemUser = body.data.system_users.find(
        (u: { email: string }) => u.email === userData.email,
      );
      expect(systemUser).toBeDefined();
      expect(systemUser.name).toBe(userData.name);
    });

    test("2.8-API-HIER-011: [P0] GET /api/admin/users/hierarchical - system users should have roles property", async ({
      superadminApiRequest,
    }) => {
      // GIVEN: I am authenticated as a System Admin

      // WHEN: Requesting hierarchical users
      const response = await superadminApiRequest.get(
        "/api/admin/users/hierarchical",
      );

      // THEN: System users have roles property
      expect(response.status()).toBe(200);
      const body = await response.json();
      if (body.data.system_users.length > 0) {
        const firstUser = body.data.system_users[0];
        expect(firstUser).toHaveProperty("roles");
        expect(Array.isArray(firstUser.roles)).toBe(true);
      }
    });
  });

  test.describe("Support Users Section (SEC-010 AUTHZ)", () => {
    test("2.8-API-HIER-020: [P0-SEC] GET /api/admin/users/hierarchical - should include SUPPORT scope users in support_users", async ({
      superadminApiRequest,
      prismaClient,
    }) => {
      // GIVEN: A user with SUPPORT scope role exists
      // SEC-010 AUTHZ: SUPPORT scope is distinct from SYSTEM scope
      const supportRole = await prismaClient.role.findFirst({
        where: { scope: "SUPPORT" },
      });
      expect(supportRole).not.toBeNull();

      const userData = createAdminUser({
        email: `support_test_${Date.now()}@test.nuvana.local`,
      });
      const user = await prismaClient.user.create({ data: userData });
      await prismaClient.userRole.create({
        data: {
          user_id: user.user_id,
          role_id: supportRole!.role_id,
          // SEC-010: SUPPORT scope does NOT require company_id or store_id
          company_id: null,
          store_id: null,
        },
      });

      // WHEN: Requesting hierarchical users
      const response = await superadminApiRequest.get(
        "/api/admin/users/hierarchical",
      );

      // THEN: User is in support_users array (NOT system_users)
      expect(response.status()).toBe(200);
      const body = await response.json();

      const supportUser = body.data.support_users.find(
        (u: { email: string }) => u.email === userData.email,
      );
      expect(supportUser).toBeDefined();
      expect(supportUser.name).toBe(userData.name);

      // AND: User is NOT in system_users
      const inSystemUsers = body.data.system_users.find(
        (u: { email: string }) => u.email === userData.email,
      );
      expect(inSystemUsers).toBeUndefined();
    });

    test("2.8-API-HIER-021: [P0-SEC] GET /api/admin/users/hierarchical - support users have null company_id in role", async ({
      superadminApiRequest,
      prismaClient,
    }) => {
      // GIVEN: A SUPPORT scope user exists
      const supportRole = await prismaClient.role.findFirst({
        where: { scope: "SUPPORT" },
      });
      expect(supportRole).not.toBeNull();

      const userData = createAdminUser({
        email: `support_null_test_${Date.now()}@test.nuvana.local`,
      });
      const user = await prismaClient.user.create({ data: userData });
      await prismaClient.userRole.create({
        data: {
          user_id: user.user_id,
          role_id: supportRole!.role_id,
          company_id: null,
          store_id: null,
        },
      });

      // WHEN: Requesting hierarchical users
      const response = await superadminApiRequest.get(
        "/api/admin/users/hierarchical",
      );

      // THEN: Support user's role has null company_id and store_id
      expect(response.status()).toBe(200);
      const body = await response.json();

      const supportUser = body.data.support_users.find(
        (u: { email: string }) => u.email === userData.email,
      );
      expect(supportUser).toBeDefined();
      expect(supportUser.roles.length).toBeGreaterThan(0);

      const supportUserRole = supportUser.roles.find(
        (r: { role: { scope: string } }) => r.role.scope === "SUPPORT",
      );
      expect(supportUserRole).toBeDefined();
      expect(supportUserRole.company_id).toBeNull();
      expect(supportUserRole.store_id).toBeNull();
    });

    test("2.8-API-HIER-022: [P0-SEC] GET /api/admin/users/hierarchical - meta total_support_users matches actual count", async ({
      superadminApiRequest,
    }) => {
      // GIVEN: I am authenticated as a System Admin

      // WHEN: Requesting hierarchical users
      const response = await superadminApiRequest.get(
        "/api/admin/users/hierarchical",
      );

      // THEN: total_support_users matches support_users array length
      expect(response.status()).toBe(200);
      const body = await response.json();

      expect(body.data.meta.total_support_users).toBe(
        body.data.support_users.length,
      );
    });

    test("2.8-API-HIER-023: [P1-SEC] GET /api/admin/users/hierarchical - support users have SUPPORT scope role code", async ({
      superadminApiRequest,
      prismaClient,
    }) => {
      // GIVEN: A SUPPORT scope user exists
      const supportRole = await prismaClient.role.findFirst({
        where: { scope: "SUPPORT" },
      });
      expect(supportRole).not.toBeNull();

      const userData = createAdminUser({
        email: `support_code_test_${Date.now()}@test.nuvana.local`,
      });
      const user = await prismaClient.user.create({ data: userData });
      await prismaClient.userRole.create({
        data: {
          user_id: user.user_id,
          role_id: supportRole!.role_id,
        },
      });

      // WHEN: Requesting hierarchical users
      const response = await superadminApiRequest.get(
        "/api/admin/users/hierarchical",
      );

      // THEN: Support user's role has SUPPORT scope
      expect(response.status()).toBe(200);
      const body = await response.json();

      const supportUser = body.data.support_users.find(
        (u: { email: string }) => u.email === userData.email,
      );
      expect(supportUser).toBeDefined();

      const hasSupport = supportUser.roles.some(
        (r: { role: { scope: string } }) => r.role.scope === "SUPPORT",
      );
      expect(hasSupport).toBe(true);
    });
  });

  test.describe("Client Owners Section", () => {
    test("2.8-API-HIER-030: [P0] GET /api/admin/users/hierarchical - client_owners contains correct structure", async ({
      superadminApiRequest,
    }) => {
      // GIVEN: I am authenticated as a System Admin

      // WHEN: Requesting hierarchical users
      const response = await superadminApiRequest.get(
        "/api/admin/users/hierarchical",
      );

      // THEN: Client owners have correct structure
      expect(response.status()).toBe(200);
      const body = await response.json();

      if (body.data.client_owners.length > 0) {
        const firstOwner = body.data.client_owners[0];
        expect(firstOwner).toHaveProperty("client_owner");
        expect(firstOwner).toHaveProperty("companies");
        expect(Array.isArray(firstOwner.companies)).toBe(true);
      }
    });

    test("2.8-API-HIER-031: [P0] GET /api/admin/users/hierarchical - meta totals match actual counts", async ({
      superadminApiRequest,
    }) => {
      // GIVEN: I am authenticated as a System Admin

      // WHEN: Requesting hierarchical users
      const response = await superadminApiRequest.get(
        "/api/admin/users/hierarchical",
      );

      // THEN: Meta totals match actual array lengths
      expect(response.status()).toBe(200);
      const body = await response.json();
      const { meta, system_users, support_users, client_owners } = body.data;

      expect(meta.total_system_users).toBe(system_users.length);
      expect(meta.total_support_users).toBe(support_users.length);
      expect(meta.total_client_owners).toBe(client_owners.length);
    });
  });

  test.describe("Authorization", () => {
    test("2.8-API-HIER-040: [P0-SEC] GET /api/admin/users/hierarchical - should reject unauthenticated requests", async ({
      request,
      backendUrl,
    }) => {
      // GIVEN: No authentication (raw request without auth headers)

      // WHEN: Requesting hierarchical users without authentication
      const response = await request.get(
        `${backendUrl}/api/admin/users/hierarchical`,
      );

      // THEN: Unauthorized error is returned
      expect(response.status()).toBe(401);
    });

    test("2.8-API-HIER-041: [P0-SEC] GET /api/admin/users/hierarchical - should reject non-admin users", async ({
      clientUserApiRequest,
    }) => {
      // GIVEN: I am authenticated as a Client User (not System Admin)

      // WHEN: Requesting hierarchical users
      const response = await clientUserApiRequest.get(
        "/api/admin/users/hierarchical",
      );

      // THEN: Forbidden error is returned
      expect(response.status()).toBe(403);
    });
  });

  test.describe("User Creation with SUPPORT Scope via API", () => {
    test("2.8-API-HIER-050: [P0] POST /api/admin/users - should create user with SUPPORT scope role", async ({
      superadminApiRequest,
      prismaClient,
    }) => {
      // GIVEN: I am authenticated as a System Admin
      const supportRole = await prismaClient.role.findFirst({
        where: { scope: "SUPPORT" },
      });
      expect(supportRole).not.toBeNull();

      const userData = createUserRequest({
        email: `support_create_${Date.now()}@test.nuvana.local`,
      });

      // WHEN: Creating a user with SUPPORT scope role
      const response = await superadminApiRequest.post("/api/admin/users", {
        email: userData.email,
        name: userData.name,
        roles: [createSupportScopeAssignment(supportRole!.role_id)],
      });

      // THEN: User is created successfully
      expect(response.status()).toBe(201);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty("user_id");

      // AND: User appears in hierarchical support_users
      const hierResponse = await superadminApiRequest.get(
        "/api/admin/users/hierarchical",
      );
      const hierBody = await hierResponse.json();

      const supportUser = hierBody.data.support_users.find(
        (u: { email: string }) => u.email === userData.email,
      );
      expect(supportUser).toBeDefined();
    });

    test("2.8-API-HIER-051: [P0-SEC] POST /api/admin/users - SUPPORT scope should NOT require company_id", async ({
      superadminApiRequest,
      prismaClient,
    }) => {
      // GIVEN: I am authenticated as a System Admin
      const supportRole = await prismaClient.role.findFirst({
        where: { scope: "SUPPORT" },
      });
      expect(supportRole).not.toBeNull();

      const userData = createUserRequest({
        email: `support_no_company_${Date.now()}@test.nuvana.local`,
      });

      // WHEN: Creating a user with SUPPORT scope role WITHOUT company_id
      const response = await superadminApiRequest.post("/api/admin/users", {
        email: userData.email,
        name: userData.name,
        roles: [
          {
            role_id: supportRole!.role_id,
            scope_type: "SUPPORT",
            // No company_id or store_id - this is valid for SUPPORT scope
          },
        ],
      });

      // THEN: User is created successfully (SUPPORT doesn't require company_id)
      expect(response.status()).toBe(201);
      const body = await response.json();
      expect(body.success).toBe(true);
    });
  });

  test.describe("Edge Cases", () => {
    test("2.8-API-HIER-060: [P1] GET /api/admin/users/hierarchical - handles empty database gracefully", async ({
      superadminApiRequest,
    }) => {
      // GIVEN: Database may have minimal data

      // WHEN: Requesting hierarchical users
      const response = await superadminApiRequest.get(
        "/api/admin/users/hierarchical",
      );

      // THEN: Success response with valid structure
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty("system_users");
      expect(body.data).toHaveProperty("support_users");
      expect(body.data).toHaveProperty("client_owners");
    });

    test("2.8-API-HIER-061: [P1] GET /api/admin/users/hierarchical - user fields have correct types", async ({
      superadminApiRequest,
    }) => {
      // GIVEN: I am authenticated as a System Admin

      // WHEN: Requesting hierarchical users
      const response = await superadminApiRequest.get(
        "/api/admin/users/hierarchical",
      );

      // THEN: User fields have correct types
      expect(response.status()).toBe(200);
      const body = await response.json();

      // Check system users structure if any exist
      if (body.data.system_users.length > 0) {
        const user = body.data.system_users[0];
        expect(typeof user.user_id).toBe("string");
        expect(typeof user.email).toBe("string");
        expect(typeof user.name).toBe("string");
        expect(typeof user.status).toBe("string");
        expect(typeof user.created_at).toBe("string");
      }

      // Check support users structure if any exist
      if (body.data.support_users.length > 0) {
        const user = body.data.support_users[0];
        expect(typeof user.user_id).toBe("string");
        expect(typeof user.email).toBe("string");
        expect(typeof user.name).toBe("string");
        expect(typeof user.status).toBe("string");
        expect(typeof user.created_at).toBe("string");
      }
    });
  });
});
