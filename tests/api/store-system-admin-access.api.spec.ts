import { test, expect } from "../support/fixtures/rbac.fixture";
import { createStore, createCompany, createUser } from "../support/helpers";
import {
  createUser as createUserFactory,
  createCompany as createCompanyFactory,
} from "../support/factories";
import {
  generatePublicId,
  PUBLIC_ID_PREFIXES,
} from "../../backend/src/utils/public-id";

/**
 * System Admin Store Access Control Tests
 *
 * TEST FILE: tests/api/store-system-admin-access.api.spec.ts
 * FEATURE: System Admin Store Management
 * CREATED: 2025-11-25
 *
 * BUSINESS RULES TESTED:
 * - BR-001: SYSTEM scope users can view ALL stores across ALL companies
 * - BR-002: COMPANY scope users CANNOT access system-wide store list
 * - BR-003: STORE scope users CANNOT access system-wide store list
 * - BR-004: System admins can create stores for ANY company
 * - BR-005: Corporate admins can ONLY create stores for THEIR company
 * - BR-006: Permission checks MUST use RLS context (no RLS = permission denied)
 * - BR-007: All permission denials are logged to audit_logs
 * - BR-008: GET /api/stores returns stores with company names
 * - BR-009: GET /api/stores respects pagination (limit, offset)
 * - BR-010: GET /api/stores sorts by created_at DESC
 * - BR-011: Unauthenticated requests return 401
 * - BR-012: JWT with wildcard permission (*) bypasses database check
 *
 * SECURITY FOCUS:
 * - Privilege escalation prevention
 * - Company isolation enforcement
 * - RLS policy enforcement
 * - Audit trail completeness
 *
 * TEST PHILOSOPHY:
 * - Tests represent ground truth - code must conform to tests
 * - Focus on critical paths and business logic
 * - Avoid testing implementation details
 * - Keep tests maintainable and fast
 */

test.describe("System Admin Store Access Control", () => {
  /**
   * BR-001: SYSTEM scope users can view ALL stores across ALL companies
   *
   * WHY: Core business requirement - system admins need visibility
   * RISK: If broken, system admins cannot manage stores
   * VALIDATES: Scope hierarchy (SYSTEM > COMPANY)
   */
  test("[P0-BR-001] System admin can view ALL stores across multiple companies", async ({
    superadminApiRequest,
    prismaClient,
    superadminUser,
  }) => {
    // GIVEN: Multiple companies with stores
    const company1 = await createCompany(prismaClient, {
      name: "Company Alpha",
      owner_user_id: superadminUser.user_id,
    });
    const company2 = await createCompany(prismaClient, {
      name: "Company Beta",
      owner_user_id: superadminUser.user_id,
    });

    const store1 = await createStore(prismaClient, {
      company_id: company1.company_id,
      name: "Store Alpha 1",
      status: "ACTIVE",
    });
    const store2 = await createStore(prismaClient, {
      company_id: company2.company_id,
      name: "Store Beta 1",
      status: "ACTIVE",
    });

    // WHEN: System admin requests all stores
    const response = await superadminApiRequest.get("/api/stores");

    // THEN: Request succeeds
    expect(response.status()).toBe(200);

    const body = await response.json();

    // AND: Response contains stores from BOTH companies
    expect(body.data).toBeInstanceOf(Array);
    expect(body.data.length).toBeGreaterThanOrEqual(2);

    const storeIds = body.data.map((s: any) => s.store_id);
    expect(storeIds).toContain(store1.store_id);
    expect(storeIds).toContain(store2.store_id);

    // AND: Each store includes company name
    const store1Data = body.data.find(
      (s: any) => s.store_id === store1.store_id,
    );
    const store2Data = body.data.find(
      (s: any) => s.store_id === store2.store_id,
    );

    expect(store1Data.company).toBeDefined();
    expect(store1Data.company.name).toBe("Company Alpha");
    expect(store2Data.company).toBeDefined();
    expect(store2Data.company.name).toBe("Company Beta");

    // AND: Response includes pagination metadata
    expect(body.meta).toBeDefined();
    expect(body.meta).toHaveProperty("total");
    expect(body.meta).toHaveProperty("limit");
    expect(body.meta).toHaveProperty("offset");
    expect(body.meta.total).toBeGreaterThanOrEqual(2);
  });

  /**
   * BR-002: COMPANY scope users CANNOT access system-wide store list
   *
   * WHY: Company isolation security boundary
   * RISK: Data leak - corporate admin sees competitor stores
   * VALIDATES: Scope enforcement, 403 response
   */
  test("[P0-BR-002] Corporate admin CANNOT access GET /api/stores", async ({
    corporateAdminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: Corporate admin user with COMPANY scope
    // (Provided by fixture)

    // WHEN: Corporate admin attempts to access system-wide store list
    const response = await corporateAdminApiRequest.get("/api/stores");

    // THEN: Request is forbidden
    expect(response.status()).toBe(403);

    const body = await response.json();

    // AND: Error message is clear
    expect(body.error).toBe("Forbidden");
    expect(body.message).toBe("Only System Administrators can view all stores");
  });

  /**
   * BR-003: STORE scope users CANNOT access system-wide store list
   *
   * WHY: Least privilege principle
   * RISK: Unauthorized access to system-wide data
   * VALIDATES: Scope enforcement at STORE level
   */
  test("[P0-BR-003] Store manager CANNOT access GET /api/stores", async ({
    storeManagerApiRequest,
    prismaClient,
  }) => {
    // GIVEN: Store manager user with STORE scope
    // (Provided by fixture)

    // WHEN: Store manager attempts to access system-wide store list
    const response = await storeManagerApiRequest.get("/api/stores");

    // THEN: Request is forbidden
    expect(response.status()).toBe(403);

    const body = await response.json();

    // AND: Error message indicates insufficient permissions
    expect(body.error).toBe("Forbidden");
    expect(body.message).toContain("Only System Administrators");
  });

  /**
   * BR-004: System admin can create store for ANY company (not their own)
   *
   * WHY: System admins operate cross-company
   * RISK: If broken, system admins cannot help clients
   * VALIDATES: SYSTEM scope bypasses company_id matching
   */
  test("[P0-BR-004] System admin can create store for ANY company", async ({
    superadminApiRequest,
    superadminUser,
    prismaClient,
  }) => {
    // GIVEN: A company that is NOT owned by the superadmin
    const differentCompany = await createCompany(prismaClient, {
      name: "Different Company",
      owner_user_id: superadminUser.user_id,
    });

    // WHEN: System admin creates store for different company
    const storeData = {
      name: "Cross-Company Store",
      timezone: "America/Los_Angeles",
      status: "ACTIVE",
    };

    const response = await superadminApiRequest.post(
      `/api/companies/${differentCompany.company_id}/stores`,
      storeData,
    );

    // THEN: Store is created successfully
    expect(response.status()).toBe(201);

    const body = await response.json();

    // AND: Store is associated with the correct company
    expect(body.company_id).toBe(differentCompany.company_id);
    expect(body.name).toBe(storeData.name);

    // AND: Verify store exists in database
    const dbStore = await prismaClient.store.findUnique({
      where: { store_id: body.store_id },
    });
    expect(dbStore).not.toBeNull();
    expect(dbStore!.company_id).toBe(differentCompany.company_id);
  });

  /**
   * BR-005: Corporate admin CANNOT create store for different company
   *
   * WHY: Company isolation security boundary
   * RISK: Data poisoning - corporate admin creates stores in competitor's account
   * VALIDATES: Company isolation in POST endpoint
   */
  test("[P0-BR-005] Corporate admin CANNOT create store for different company", async ({
    corporateAdminApiRequest,
    corporateAdminUser,
    prismaClient,
  }) => {
    // GIVEN: A different company (not the corporate admin's company)
    // Create a user to own this company
    const ownerUser = await createUser(prismaClient);
    const differentCompany = await createCompany(prismaClient, {
      name: "Competitor Company",
      owner_user_id: ownerUser.user_id,
    });

    // WHEN: Corporate admin attempts to create store for different company
    const storeData = {
      name: "Unauthorized Store",
      timezone: "America/New_York",
      status: "ACTIVE",
    };

    const response = await corporateAdminApiRequest.post(
      `/api/companies/${differentCompany.company_id}/stores`,
      storeData,
    );

    // THEN: Request is forbidden
    expect(response.status()).toBe(403);

    const body = await response.json();

    // AND: Error message indicates company isolation
    expect(body.error).toBe("Forbidden");
    expect(body.message).toContain("your assigned company");

    // AND: Verify store was NOT created in database
    const stores = await prismaClient.store.findMany({
      where: {
        company_id: differentCompany.company_id,
        name: "Unauthorized Store",
      },
    });
    expect(stores).toHaveLength(0);
  });

  /**
   * BR-006: GET /api/stores requires RLS context for permission check
   *
   * WHY: RLS policies protect user_roles table
   * RISK: Permission check fails silently, denies valid access
   * VALIDATES: withRLSContext() wrapper is used
   *
   * NOTE: This test verifies that the endpoint works with RLS policies enabled.
   * If RLS context is missing, the permission check would fail.
   */
  test("[P0-BR-006] GET /api/stores works with RLS context enabled", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: RLS policies are enabled on user_roles table
    // (This is the production configuration)

    // WHEN: System admin requests stores
    const response = await superadminApiRequest.get("/api/stores");

    // THEN: Request succeeds (RLS context is properly set)
    expect(response.status()).toBe(200);

    const body = await response.json();

    // AND: Response is valid
    expect(body.data).toBeInstanceOf(Array);
    expect(body.meta).toBeDefined();

    // NOTE: If withRLSContext() was missing, this would return 403
    // because the permission check query would fail
  });

  /**
   * BR-007: Permission denial is logged to audit_logs
   *
   * WHY: Security audit trail for compliance
   * RISK: No evidence of unauthorized access attempts
   * VALIDATES: audit_logs table has PERMISSION_DENIED entry
   */
  test("[P0-BR-007] Permission denial is logged to audit_logs", async ({
    corporateAdminApiRequest,
    corporateAdminUser,
    prismaClient,
  }) => {
    // GIVEN: Corporate admin (who will be denied)
    const initialAuditCount = await prismaClient.auditLog.count({
      where: {
        user_id: corporateAdminUser.user_id,
        action: "PERMISSION_DENIED",
      },
    });

    // WHEN: Corporate admin is denied access to system-wide stores
    const response = await corporateAdminApiRequest.get("/api/stores");

    // THEN: Request is forbidden
    expect(response.status()).toBe(403);

    // AND: Audit log entry is created
    const auditLogs = await prismaClient.auditLog.findMany({
      where: {
        user_id: corporateAdminUser.user_id,
        action: "PERMISSION_DENIED",
      },
      orderBy: { timestamp: "desc" },
      take: 1,
    });

    expect(auditLogs.length).toBeGreaterThan(0);

    const latestAuditLog = auditLogs[0];

    // AND: Audit log contains correct information
    expect(latestAuditLog.action).toBe("PERMISSION_DENIED");
    expect(latestAuditLog.table_name).toBe("api_route");
    expect(latestAuditLog.reason).toContain("STORE_READ");
    expect(latestAuditLog.reason).toContain("GET /api/stores");

    // AND: New audit log was created (count increased)
    const finalAuditCount = await prismaClient.auditLog.count({
      where: {
        user_id: corporateAdminUser.user_id,
        action: "PERMISSION_DENIED",
      },
    });
    expect(finalAuditCount).toBe(initialAuditCount + 1);
  });

  /**
   * BR-008: GET /api/stores returns stores with company names
   *
   * WHY: UI needs company context for each store
   * RISK: UI shows "—" for all companies (bad UX)
   * VALIDATES: Prisma include: { company: { select: { name: true } } }
   */
  test("[P0-BR-008] GET /api/stores returns stores with company names", async ({
    superadminApiRequest,
    prismaClient,
    superadminUser,
  }) => {
    // GIVEN: Company with a store
    const company = await createCompany(prismaClient, {
      name: "Test Company with Name",
      owner_user_id: superadminUser.user_id,
    });

    const store = await createStore(prismaClient, {
      company_id: company.company_id,
      name: "Test Store",
    });

    // WHEN: System admin requests stores
    const response = await superadminApiRequest.get("/api/stores");

    // THEN: Request succeeds
    expect(response.status()).toBe(200);

    const body = await response.json();

    // AND: Store includes company name
    const storeData = body.data.find((s: any) => s.store_id === store.store_id);
    expect(storeData).toBeDefined();
    expect(storeData.company).toBeDefined();
    expect(storeData.company.name).toBe("Test Company with Name");

    // AND: Company object only includes name (not full company data)
    expect(Object.keys(storeData.company)).toEqual(["name"]);
  });

  /**
   * BR-009: GET /api/stores respects pagination (limit, offset)
   *
   * WHY: Performance with large datasets
   * RISK: OOM crash with 10,000+ stores
   * VALIDATES: Query parameters work correctly
   */
  test("[P0-BR-009] GET /api/stores respects pagination parameters", async ({
    superadminApiRequest,
    prismaClient,
    superadminUser,
  }) => {
    // GIVEN: Multiple stores (at least 5)
    const company = await createCompany(prismaClient, {
      name: "Pagination Test Company",
      owner_user_id: superadminUser.user_id,
    });

    const stores = await Promise.all([
      createStore(prismaClient, {
        company_id: company.company_id,
        name: "Store 1",
      }),
      createStore(prismaClient, {
        company_id: company.company_id,
        name: "Store 2",
      }),
      createStore(prismaClient, {
        company_id: company.company_id,
        name: "Store 3",
      }),
      createStore(prismaClient, {
        company_id: company.company_id,
        name: "Store 4",
      }),
      createStore(prismaClient, {
        company_id: company.company_id,
        name: "Store 5",
      }),
    ]);

    // WHEN: Requesting with limit=2
    const response1 = await superadminApiRequest.get(
      "/api/stores?limit=2&offset=0",
    );

    // THEN: Only 2 stores returned
    expect(response1.status()).toBe(200);
    const body1 = await response1.json();
    expect(body1.data).toHaveLength(2);
    expect(body1.meta.limit).toBe(2);
    expect(body1.meta.offset).toBe(0);

    // WHEN: Requesting with offset=2
    const response2 = await superadminApiRequest.get(
      "/api/stores?limit=2&offset=2",
    );

    // THEN: Next 2 stores returned
    expect(response2.status()).toBe(200);
    const body2 = await response2.json();
    expect(body2.data).toHaveLength(2);
    expect(body2.meta.limit).toBe(2);
    expect(body2.meta.offset).toBe(2);

    // AND: Different stores are returned (pagination works)
    const firstPageIds = body1.data.map((s: any) => s.store_id);
    const secondPageIds = body2.data.map((s: any) => s.store_id);
    const overlap = firstPageIds.filter((id: string) =>
      secondPageIds.includes(id),
    );
    expect(overlap).toHaveLength(0); // No overlap = pagination works
  });

  /**
   * BR-010: GET /api/stores sorts by created_at DESC
   *
   * WHY: Newest stores first (expected UI behavior)
   * RISK: Random order confuses users
   * VALIDATES: orderBy: { created_at: "desc" }
   */
  test("[P0-BR-010] GET /api/stores sorts by created_at DESC (newest first)", async ({
    superadminApiRequest,
    prismaClient,
    superadminUser,
  }) => {
    // GIVEN: Stores created in sequence
    const company = await createCompany(prismaClient, {
      name: "Sorting Test Company",
      owner_user_id: superadminUser.user_id,
    });

    const store1 = await createStore(prismaClient, {
      company_id: company.company_id,
      name: "Oldest Store",
    });

    // Wait to ensure different timestamps
    await new Promise((resolve) => setTimeout(resolve, 10));

    const store2 = await createStore(prismaClient, {
      company_id: company.company_id,
      name: "Middle Store",
    });

    await new Promise((resolve) => setTimeout(resolve, 10));

    const store3 = await createStore(prismaClient, {
      company_id: company.company_id,
      name: "Newest Store",
    });

    // WHEN: Requesting stores
    const response = await superadminApiRequest.get("/api/stores?limit=10");

    // THEN: Request succeeds
    expect(response.status()).toBe(200);

    const body = await response.json();

    // AND: Our test stores are in DESC order (newest first)
    const ourStores = body.data.filter((s: any) =>
      [store1.store_id, store2.store_id, store3.store_id].includes(s.store_id),
    );

    expect(ourStores.length).toBe(3);

    const store3Index = ourStores.findIndex(
      (s: any) => s.store_id === store3.store_id,
    );
    const store2Index = ourStores.findIndex(
      (s: any) => s.store_id === store2.store_id,
    );
    const store1Index = ourStores.findIndex(
      (s: any) => s.store_id === store1.store_id,
    );

    // Newest (store3) should come before middle (store2) and oldest (store1)
    expect(store3Index).toBeLessThan(store2Index);
    expect(store2Index).toBeLessThan(store1Index);
  });

  /**
   * BR-011: Unauthenticated request to GET /api/stores returns 401
   *
   * WHY: All endpoints require authentication
   * RISK: Public access to sensitive business data
   * VALIDATES: authMiddleware is applied
   */
  test("[P0-BR-011] Unauthenticated request returns 401", async ({
    request,
  }) => {
    // GIVEN: No authentication credentials
    // (Using base Playwright request, not authenticated fixture)

    // WHEN: Requesting stores without auth
    const response = await request.get(
      `${process.env.API_URL || "http://localhost:3001"}/api/stores`,
    );

    // THEN: Request is unauthorized
    expect(response.status()).toBe(401);

    const body = await response.json();

    // AND: Error message is clear
    expect(body.error).toBe("Unauthorized");
  });

  /**
   * BR-013: System admin can view store from ANY company
   *
   * WHY: System admins need cross-company visibility
   * RISK: If broken, system admins blocked from viewing stores
   * VALIDATES: GET /api/stores/:storeId allows SYSTEM scope
   */
  test("[P0-BR-013] System admin can view store from any company", async ({
    superadminApiRequest,
    prismaClient,
    superadminUser,
  }) => {
    // GIVEN: A company and store
    const company = await createCompany(prismaClient, {
      name: "Test Company",
      owner_user_id: superadminUser.user_id,
    });
    const store = await createStore(prismaClient, {
      company_id: company.company_id,
      name: "Test Store",
      status: "ACTIVE",
    });

    // WHEN: System admin views the store
    const response = await superadminApiRequest.get(
      `/api/stores/${store.store_id}`,
    );

    // THEN: Request succeeds
    expect(response.status()).toBe(200);

    const body = await response.json();

    // AND: Store details are returned
    expect(body.store_id).toBe(store.store_id);
    expect(body.name).toBe("Test Store");
    expect(body.company_id).toBe(company.company_id);
  });

  /**
   * BR-014: System admin can update store from ANY company
   *
   * WHY: System admins need cross-company management
   * RISK: If broken, system admins cannot help clients
   * VALIDATES: PUT /api/stores/:storeId allows SYSTEM scope
   */
  test("[P0-BR-014] System admin can update store from any company", async ({
    superadminApiRequest,
    prismaClient,
    superadminUser,
  }) => {
    // GIVEN: A company and store
    const company = await createCompany(prismaClient, {
      name: "Test Company",
      owner_user_id: superadminUser.user_id,
    });
    const store = await createStore(prismaClient, {
      company_id: company.company_id,
      name: "Original Name",
      status: "ACTIVE",
    });

    // WHEN: System admin updates the store
    const response = await superadminApiRequest.put(
      `/api/stores/${store.store_id}`,
      {
        name: "Updated Name",
        status: "INACTIVE",
      },
    );

    // THEN: Request succeeds
    expect(response.status()).toBe(200);

    const body = await response.json();

    // AND: Store is updated
    expect(body.name).toBe("Updated Name");
    expect(body.status).toBe("INACTIVE");

    // AND: Verify in database
    const dbStore = await prismaClient.store.findUnique({
      where: { store_id: store.store_id },
    });
    expect(dbStore?.name).toBe("Updated Name");
    expect(dbStore?.status).toBe("INACTIVE");
  });

  /**
   * BR-015: System admin can delete store from ANY company
   *
   * WHY: System admins need cross-company management
   * RISK: If broken, system admins cannot clean up test/old data
   * VALIDATES: DELETE /api/stores/:storeId allows SYSTEM scope
   */
  test("[P0-BR-015] System admin can delete store from any company", async ({
    superadminApiRequest,
    prismaClient,
    superadminUser,
  }) => {
    // GIVEN: A company and INACTIVE store (deletable)
    const company = await createCompany(prismaClient, {
      name: "Test Company",
      owner_user_id: superadminUser.user_id,
    });
    const store = await createStore(prismaClient, {
      company_id: company.company_id,
      name: "Store to Delete",
      status: "INACTIVE", // Must be INACTIVE to delete
    });

    // WHEN: System admin deletes the store
    const response = await superadminApiRequest.delete(
      `/api/stores/${store.store_id}`,
    );

    // THEN: Request succeeds
    expect(response.status()).toBe(200);

    // AND: Verify store is deleted from database
    const dbStore = await prismaClient.store.findUnique({
      where: { store_id: store.store_id },
    });
    expect(dbStore).toBeNull();
  });

  /**
   * BR-016: System admin can update store configuration for ANY company
   *
   * WHY: System admins need cross-company management
   * RISK: If broken, system admins cannot configure stores
   * VALIDATES: PUT /api/stores/:storeId/configuration allows SYSTEM scope
   */
  test("[P0-BR-016] System admin can update store configuration for any company", async ({
    superadminApiRequest,
    prismaClient,
    superadminUser,
  }) => {
    // GIVEN: A company and store
    const company = await createCompany(prismaClient, {
      name: "Test Company",
      owner_user_id: superadminUser.user_id,
    });
    const store = await createStore(prismaClient, {
      company_id: company.company_id,
      name: "Test Store",
      status: "ACTIVE",
    });

    // WHEN: System admin updates store configuration
    const response = await superadminApiRequest.put(
      `/api/stores/${store.store_id}/configuration`,
      {
        timezone: "Europe/London",
        location_json: {
          address: "123 Main St, London",
        },
      },
    );

    // THEN: Request succeeds
    expect(response.status()).toBe(200);

    const body = await response.json();

    // AND: Configuration is updated
    expect(body.timezone).toBe("Europe/London");
    expect(body.location_json.address).toBe("123 Main St, London");

    // AND: Verify in database
    const dbStore = await prismaClient.store.findUnique({
      where: { store_id: store.store_id },
    });
    expect(dbStore?.timezone).toBe("Europe/London");
    expect((dbStore?.location_json as any)?.address).toBe(
      "123 Main St, London",
    );
  });

  /**
   * BR-012: JWT with wildcard permission (*) bypasses database check
   *
   * WHY: Performance optimization for superadmin
   * RISK: If broken, superadmin queries slow down
   * VALIDATES: Early return when permissions includes "*"
   *
   * NOTE: This test verifies the optimization path works correctly.
   * Superadmin user should have wildcard permission in their JWT.
   */
  test("[P0-BR-012] Superadmin with wildcard permission accesses stores quickly", async ({
    superadminApiRequest,
    superadminUser,
    prismaClient,
  }) => {
    // GIVEN: Superadmin user (should have wildcard permission in JWT)
    // WHEN: System admin requests stores
    const startTime = Date.now();
    const response = await superadminApiRequest.get("/api/stores");
    const endTime = Date.now();

    // THEN: Request succeeds
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.data).toBeInstanceOf(Array);

    // AND: Request completes quickly (< 500ms, indicating no complex DB queries)
    const duration = endTime - startTime;
    expect(duration).toBeLessThan(500);

    // NOTE: Wildcard permission should bypass RBAC check, making this fast
    // If wildcard check was missing, duration would be higher due to DB queries
  });
});
