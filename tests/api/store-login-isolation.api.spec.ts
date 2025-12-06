import { test, expect } from "../support/fixtures/rbac.fixture";
import { createStore, createCompany, createUser } from "../support/helpers";
import { withBypassClient } from "../support/prisma-bypass";
import { createJWTAccessToken } from "../support/factories";

/**
 * Store Login Isolation Tests
 *
 * TEST FILE: tests/api/store-login-isolation.api.spec.ts
 * FEATURE: Store Login (CLIENT_USER) Store Isolation
 * CREATED: 2025-12-06
 *
 * CRITICAL SECURITY TESTS:
 * These tests validate that store login users (CLIENT_USER role with STORE scope)
 * can ONLY access their assigned store's data. This prevents cross-store data leakage
 * within the same company.
 *
 * BUSINESS CONTEXT:
 * - Store login is a machine/location credential for physical terminal authentication
 * - Each store has ONE store login credential
 * - Store login authenticates the physical device at a specific store location
 * - Store login MUST only see their own store - never other stores in the company
 *
 * SECURITY STANDARDS:
 * - DB-006: TENANT_ISOLATION - Row-level security for multi-tenant data
 * - SEC-010: AUTHZ - Server-side authorization with fail-closed logic
 * - API-009: IDOR - Object ownership validation on every read/write
 *
 * WHY THESE TESTS EXIST:
 * Bug discovered: CLIENT_USER role was incorrectly set to COMPANY scope instead of STORE scope.
 * This allowed store login users to access ALL stores in a company instead of only their assigned store.
 * These tests ensure this regression never happens again.
 */

test.describe("Store Login Isolation - P0 Critical Security", () => {
  /**
   * CRITICAL: Store login user can only access their own store via dashboard
   *
   * WHY: This is the primary use case - store login authenticates a physical terminal
   *      and that terminal should ONLY see data for its assigned store.
   * RISK: Cross-store data leakage, competitor information exposure
   * SECURITY: DB-006 TENANT_ISOLATION, SEC-010 AUTHZ
   */
  test("[P0-ISOLATION-01] Store login user sees ONLY their assigned store in dashboard", async ({
    apiRequest,
    backendUrl,
    prismaClient,
  }) => {
    // GIVEN: A company with multiple stores
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      owner_user_id: owner.user_id,
      name: "Test Multi-Store Company",
    });

    // Create Store A (assigned to store login)
    const storeA = await createStore(prismaClient, {
      company_id: company.company_id,
      name: "Test Store A - Assigned",
    });

    // Create Store B (NOT assigned to store login - should be invisible)
    const storeB = await createStore(prismaClient, {
      company_id: company.company_id,
      name: "Test Store B - Hidden",
    });

    // Create store login user for Store A
    // Note: is_client_user is determined by role assignment, not user properties
    const storeLoginUser = await createUser(prismaClient, {
      name: "Store A Login",
      email: `store-a-login-${Date.now()}@test.com`,
    });

    // Get CLIENT_USER role and assign with STORE scope (store_id)
    const clientUserRole = await prismaClient.role.findUnique({
      where: { code: "CLIENT_USER" },
    });
    expect(clientUserRole).not.toBeNull();
    expect(clientUserRole!.scope).toBe("STORE"); // Verify role scope is STORE

    await withBypassClient(async (bypassClient) => {
      await bypassClient.userRole.create({
        data: {
          user_id: storeLoginUser.user_id,
          role_id: clientUserRole!.role_id,
          company_id: company.company_id,
          store_id: storeA.store_id, // CRITICAL: Assigned to Store A only
        },
      });
    });

    // Create JWT token for store login user
    const token = createJWTAccessToken({
      user_id: storeLoginUser.user_id,
      email: storeLoginUser.email,
      roles: ["CLIENT_USER"],
      permissions: ["CLIENT_DASHBOARD_ACCESS", "STORE_READ", "SHIFT_READ"],
    });

    // WHEN: Store login user accesses the client dashboard
    const response = await apiRequest.get("/api/client/dashboard", {
      headers: { Cookie: `access_token=${token}` },
    });

    // THEN: Request succeeds
    expect(response.status()).toBe(200);
    const body = await response.json();

    // AND: Only Store A is visible (the assigned store)
    // Response structure: { success: true, data: { stores: [...] } }
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
    expect(body.data.stores).toBeDefined();
    expect(Array.isArray(body.data.stores)).toBe(true);

    const storeIds = body.data.stores.map((s: any) => s.store_id);
    expect(storeIds).toContain(storeA.store_id);
    expect(storeIds).not.toContain(storeB.store_id);

    // AND: Only exactly one store is returned
    expect(body.data.stores.length).toBe(1);
    expect(body.data.stores[0].name).toBe("Test Store A - Assigned");

    // Cleanup
    await withBypassClient(async (bypassClient) => {
      await bypassClient.userRole.deleteMany({
        where: { user_id: storeLoginUser.user_id },
      });
      await bypassClient.user.delete({
        where: { user_id: storeLoginUser.user_id },
      });
      await bypassClient.store.deleteMany({
        where: { company_id: company.company_id },
      });
      await bypassClient.company.delete({
        where: { company_id: company.company_id },
      });
      await bypassClient.user.delete({ where: { user_id: owner.user_id } });
    });
  });

  /**
   * CRITICAL: Store login user cannot access another store's data directly
   *
   * WHY: Even if someone guesses another store's ID, they should be denied
   * RISK: IDOR vulnerability, unauthorized data access
   * SECURITY: API-009 IDOR, DB-006 TENANT_ISOLATION
   */
  test("[P0-ISOLATION-02] Store login user cannot access another store by direct ID", async ({
    apiRequest,
    prismaClient,
  }) => {
    // GIVEN: A company with two stores
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      owner_user_id: owner.user_id,
      name: "Test Direct Access Company",
    });

    const storeA = await createStore(prismaClient, {
      company_id: company.company_id,
      name: "Test Store A - Assigned Direct",
    });

    const storeB = await createStore(prismaClient, {
      company_id: company.company_id,
      name: "Test Store B - Protected Direct",
    });

    // Create store login user for Store A
    // Note: is_client_user is determined by role assignment, not user properties
    const storeLoginUser = await createUser(prismaClient, {
      name: "Store A Login Direct",
      email: `store-a-direct-${Date.now()}@test.com`,
    });

    const clientUserRole = await prismaClient.role.findUnique({
      where: { code: "CLIENT_USER" },
    });

    await withBypassClient(async (bypassClient) => {
      await bypassClient.userRole.create({
        data: {
          user_id: storeLoginUser.user_id,
          role_id: clientUserRole!.role_id,
          company_id: company.company_id,
          store_id: storeA.store_id,
        },
      });
    });

    const token = createJWTAccessToken({
      user_id: storeLoginUser.user_id,
      email: storeLoginUser.email,
      roles: ["CLIENT_USER"],
      permissions: ["CLIENT_DASHBOARD_ACCESS", "STORE_READ", "SHIFT_READ"],
    });

    // WHEN: Store login user tries to access Store B directly
    const response = await apiRequest.get(`/api/stores/${storeB.store_id}`, {
      headers: { Cookie: `access_token=${token}` },
    });

    // THEN: Access is denied (403 Forbidden or 404 Not Found - both are acceptable)
    // 403 = "you don't have permission" (explicit denial)
    // 404 = "resource doesn't exist for you" (implicit denial - preferred for IDOR prevention)
    expect([403, 404]).toContain(response.status());

    // Cleanup
    await withBypassClient(async (bypassClient) => {
      await bypassClient.userRole.deleteMany({
        where: { user_id: storeLoginUser.user_id },
      });
      await bypassClient.user.delete({
        where: { user_id: storeLoginUser.user_id },
      });
      await bypassClient.store.deleteMany({
        where: { company_id: company.company_id },
      });
      await bypassClient.company.delete({
        where: { company_id: company.company_id },
      });
      await bypassClient.user.delete({ where: { user_id: owner.user_id } });
    });
  });

  /**
   * CRITICAL: Store login cannot access shifts endpoint for another store
   *
   * WHY: Shift data contains sensitive business information (sales, cash counts)
   * RISK: Competitor intelligence, internal fraud opportunities
   * SECURITY: DB-006 TENANT_ISOLATION
   *
   * Note: This test verifies API-level authorization - it doesn't need to create
   * actual shifts since the authorization check happens before data is queried.
   */
  test("[P0-ISOLATION-03] Store login user cannot access shifts endpoint for other stores", async ({
    apiRequest,
    prismaClient,
  }) => {
    // GIVEN: A company with two stores
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      owner_user_id: owner.user_id,
      name: "Test Shift Isolation Company",
    });

    const storeA = await createStore(prismaClient, {
      company_id: company.company_id,
      name: "Test Store A - Shifts Assigned",
    });

    const storeB = await createStore(prismaClient, {
      company_id: company.company_id,
      name: "Test Store B - Shifts Hidden",
    });

    // Create store login user for Store A
    // Note: is_client_user is determined by role assignment, not user properties
    const storeLoginUser = await createUser(prismaClient, {
      name: "Store A Login Shifts",
      email: `store-a-shifts-${Date.now()}@test.com`,
    });

    const clientUserRole = await prismaClient.role.findUnique({
      where: { code: "CLIENT_USER" },
    });

    await withBypassClient(async (bypassClient) => {
      await bypassClient.userRole.create({
        data: {
          user_id: storeLoginUser.user_id,
          role_id: clientUserRole!.role_id,
          company_id: company.company_id,
          store_id: storeA.store_id,
        },
      });
    });

    const token = createJWTAccessToken({
      user_id: storeLoginUser.user_id,
      email: storeLoginUser.email,
      roles: ["CLIENT_USER"],
      permissions: ["CLIENT_DASHBOARD_ACCESS", "STORE_READ", "SHIFT_READ"],
    });

    // WHEN: Store login user tries to access Store B's shifts endpoint
    const response = await apiRequest.get(
      `/api/stores/${storeB.store_id}/shifts`,
      {
        headers: { Cookie: `access_token=${token}` },
      },
    );

    // THEN: Access is denied (authorization fails before data query)
    // 403 = Forbidden, 404 = Not found (IDOR protection)
    expect([403, 404]).toContain(response.status());

    // Cleanup
    await withBypassClient(async (bypassClient) => {
      await bypassClient.userRole.deleteMany({
        where: { user_id: storeLoginUser.user_id },
      });
      await bypassClient.user.delete({
        where: { user_id: storeLoginUser.user_id },
      });
      await bypassClient.store.deleteMany({
        where: { company_id: company.company_id },
      });
      await bypassClient.company.delete({
        where: { company_id: company.company_id },
      });
      await bypassClient.user.delete({ where: { user_id: owner.user_id } });
    });
  });

  /**
   * CRITICAL: Verify CLIENT_USER role has STORE scope (not COMPANY scope)
   *
   * WHY: This is a database-level check that prevents the root cause of the bug
   * RISK: If scope is COMPANY, all store isolation tests will pass but production will fail
   * SECURITY: This is the root cause verification test
   */
  test("[P0-ISOLATION-04] CLIENT_USER role has STORE scope in database", async ({
    prismaClient,
  }) => {
    // WHEN: We query the CLIENT_USER role
    const clientUserRole = await prismaClient.role.findUnique({
      where: { code: "CLIENT_USER" },
    });

    // THEN: Role exists
    expect(clientUserRole).not.toBeNull();

    // AND: Scope is STORE (not COMPANY, not SYSTEM)
    expect(clientUserRole!.scope).toBe("STORE");

    // AND: It's a system role (should not be deleted)
    expect(clientUserRole!.is_system_role).toBe(true);
  });

  /**
   * CRITICAL: Store login user CAN access their own assigned store
   *
   * WHY: Positive test - ensure we didn't break legitimate access while fixing isolation
   * RISK: Overly restrictive permissions breaking business functionality
   */
  test("[P0-ISOLATION-05] Store login user CAN access their assigned store", async ({
    apiRequest,
    prismaClient,
  }) => {
    // GIVEN: A store with a login user
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      owner_user_id: owner.user_id,
      name: "Test Positive Access Company",
    });

    const store = await createStore(prismaClient, {
      company_id: company.company_id,
      name: "Test Store - Positive Access",
    });

    // Note: is_client_user is determined by role assignment, not user properties
    const storeLoginUser = await createUser(prismaClient, {
      name: "Store Login Positive",
      email: `store-positive-${Date.now()}@test.com`,
    });

    const clientUserRole = await prismaClient.role.findUnique({
      where: { code: "CLIENT_USER" },
    });

    await withBypassClient(async (bypassClient) => {
      await bypassClient.userRole.create({
        data: {
          user_id: storeLoginUser.user_id,
          role_id: clientUserRole!.role_id,
          company_id: company.company_id,
          store_id: store.store_id,
        },
      });
    });

    const token = createJWTAccessToken({
      user_id: storeLoginUser.user_id,
      email: storeLoginUser.email,
      roles: ["CLIENT_USER"],
      permissions: ["CLIENT_DASHBOARD_ACCESS", "STORE_READ", "SHIFT_READ"],
    });

    // WHEN: Store login user accesses their own store
    const response = await apiRequest.get(`/api/stores/${store.store_id}`, {
      headers: { Cookie: `access_token=${token}` },
    });

    // THEN: Access is granted
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.store_id).toBe(store.store_id);
    expect(body.name).toBe("Test Store - Positive Access");

    // Cleanup
    await withBypassClient(async (bypassClient) => {
      await bypassClient.userRole.deleteMany({
        where: { user_id: storeLoginUser.user_id },
      });
      await bypassClient.user.delete({
        where: { user_id: storeLoginUser.user_id },
      });
      await bypassClient.store.deleteMany({
        where: { company_id: company.company_id },
      });
      await bypassClient.company.delete({
        where: { company_id: company.company_id },
      });
      await bypassClient.user.delete({ where: { user_id: owner.user_id } });
    });
  });
});

test.describe("Store Login Isolation - P1 Extended Security", () => {
  /**
   * Store login cannot access stores from different companies
   *
   * WHY: Cross-company isolation is even more critical than cross-store
   * RISK: Competitor data exposure, regulatory violations
   */
  test("[P1-ISOLATION-06] Store login user cannot access stores from different companies", async ({
    apiRequest,
    prismaClient,
  }) => {
    // GIVEN: Two different companies
    const ownerA = await createUser(prismaClient);
    const companyA = await createCompany(prismaClient, {
      owner_user_id: ownerA.user_id,
      name: "Test Company A - Cross Company",
    });

    const ownerB = await createUser(prismaClient);
    const companyB = await createCompany(prismaClient, {
      owner_user_id: ownerB.user_id,
      name: "Test Company B - Cross Company",
    });

    const storeA = await createStore(prismaClient, {
      company_id: companyA.company_id,
      name: "Test Store A - Company A",
    });

    const storeB = await createStore(prismaClient, {
      company_id: companyB.company_id,
      name: "Test Store B - Company B",
    });

    // Create store login user for Store A (Company A)
    // Note: is_client_user is determined by role assignment, not user properties
    const storeLoginUser = await createUser(prismaClient, {
      name: "Store A Login Cross",
      email: `store-cross-${Date.now()}@test.com`,
    });

    const clientUserRole = await prismaClient.role.findUnique({
      where: { code: "CLIENT_USER" },
    });

    await withBypassClient(async (bypassClient) => {
      await bypassClient.userRole.create({
        data: {
          user_id: storeLoginUser.user_id,
          role_id: clientUserRole!.role_id,
          company_id: companyA.company_id,
          store_id: storeA.store_id,
        },
      });
    });

    const token = createJWTAccessToken({
      user_id: storeLoginUser.user_id,
      email: storeLoginUser.email,
      roles: ["CLIENT_USER"],
      permissions: ["CLIENT_DASHBOARD_ACCESS", "STORE_READ", "SHIFT_READ"],
    });

    // WHEN: Store login user tries to access Store B (different company)
    const response = await apiRequest.get(`/api/stores/${storeB.store_id}`, {
      headers: { Cookie: `access_token=${token}` },
    });

    // THEN: Access is denied
    expect([403, 404]).toContain(response.status());

    // Cleanup
    await withBypassClient(async (bypassClient) => {
      await bypassClient.userRole.deleteMany({
        where: { user_id: storeLoginUser.user_id },
      });
      await bypassClient.user.delete({
        where: { user_id: storeLoginUser.user_id },
      });
      await bypassClient.store.delete({ where: { store_id: storeA.store_id } });
      await bypassClient.store.delete({ where: { store_id: storeB.store_id } });
      await bypassClient.company.delete({
        where: { company_id: companyA.company_id },
      });
      await bypassClient.company.delete({
        where: { company_id: companyB.company_id },
      });
      await bypassClient.user.delete({ where: { user_id: ownerA.user_id } });
      await bypassClient.user.delete({ where: { user_id: ownerB.user_id } });
    });
  });

  /**
   * Multiple store logins in same company are properly isolated
   *
   * WHY: Validates that isolation works even when multiple stores have logins
   * RISK: N-way data leakage when multiple stores exist
   */
  test("[P1-ISOLATION-07] Multiple store logins in same company are isolated from each other", async ({
    apiRequest,
    prismaClient,
  }) => {
    // GIVEN: A company with three stores, each with their own login
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      owner_user_id: owner.user_id,
      name: "Test Multi-Login Company",
    });

    const stores = await Promise.all([
      createStore(prismaClient, {
        company_id: company.company_id,
        name: "Test Store 1 - Multi",
      }),
      createStore(prismaClient, {
        company_id: company.company_id,
        name: "Test Store 2 - Multi",
      }),
      createStore(prismaClient, {
        company_id: company.company_id,
        name: "Test Store 3 - Multi",
      }),
    ]);

    const clientUserRole = await prismaClient.role.findUnique({
      where: { code: "CLIENT_USER" },
    });

    // Create login user for Store 1
    // Note: is_client_user is determined by role assignment, not user properties
    const store1LoginUser = await createUser(prismaClient, {
      name: "Store 1 Login Multi",
      email: `store1-multi-${Date.now()}@test.com`,
    });

    await withBypassClient(async (bypassClient) => {
      await bypassClient.userRole.create({
        data: {
          user_id: store1LoginUser.user_id,
          role_id: clientUserRole!.role_id,
          company_id: company.company_id,
          store_id: stores[0].store_id,
        },
      });
    });

    const token = createJWTAccessToken({
      user_id: store1LoginUser.user_id,
      email: store1LoginUser.email,
      roles: ["CLIENT_USER"],
      permissions: ["CLIENT_DASHBOARD_ACCESS", "STORE_READ", "SHIFT_READ"],
    });

    // WHEN: Store 1 login user accesses dashboard
    const response = await apiRequest.get("/api/client/dashboard", {
      headers: { Cookie: `access_token=${token}` },
    });

    // THEN: Only Store 1 is visible
    // Response structure: { success: true, data: { stores: [...] } }
    expect(response.status()).toBe(200);
    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
    expect(body.data.stores).toBeDefined();
    expect(body.data.stores.length).toBe(1);
    expect(body.data.stores[0].store_id).toBe(stores[0].store_id);
    expect(body.data.stores[0].name).toBe("Test Store 1 - Multi");

    // AND: Stores 2 and 3 are NOT visible
    const storeIds = body.data.stores.map((s: any) => s.store_id);
    expect(storeIds).not.toContain(stores[1].store_id);
    expect(storeIds).not.toContain(stores[2].store_id);

    // Cleanup
    await withBypassClient(async (bypassClient) => {
      await bypassClient.userRole.deleteMany({
        where: { user_id: store1LoginUser.user_id },
      });
      await bypassClient.user.delete({
        where: { user_id: store1LoginUser.user_id },
      });
      await bypassClient.store.deleteMany({
        where: { company_id: company.company_id },
      });
      await bypassClient.company.delete({
        where: { company_id: company.company_id },
      });
      await bypassClient.user.delete({ where: { user_id: owner.user_id } });
    });
  });
});
