import { test, expect } from "../support/fixtures/rbac.fixture";
import { createStore, createCompany, createUser } from "../support/helpers";
import {
  generatePublicId,
  PUBLIC_ID_PREFIXES,
} from "../../backend/src/utils/public-id";

/**
 * Store-Company Isolation & Integrity Tests
 *
 * TEST FILE: tests/api/store-company-isolation.api.spec.ts
 * FEATURE: Store-Company Data Integrity
 * CREATED: 2025-11-25
 *
 * BUSINESS RULES TESTED:
 * - BR-101: Stores MUST be associated with a valid company (FK constraint)
 * - BR-102: Corporate admin can ONLY see stores for THEIR company
 * - BR-103: System admin sees stores from ALL companies (including INACTIVE)
 * - BR-104: Soft-deleted companies' stores are EXCLUDED from system admin list
 * - BR-105: When company is hard-deleted, stores CASCADE delete
 * - BR-106: Store created by system admin can be managed by corporate admin
 *
 * DATA INTEGRITY FOCUS:
 * - Foreign key constraints
 * - Cascade deletion
 * - Soft-delete filtering
 * - Referential integrity
 * - Cross-role workflows
 *
 * TEST PHILOSOPHY:
 * - Tests represent ground truth - code must conform to tests
 * - Focus on data integrity and isolation
 * - Validate FK constraints and cascade behavior
 */

test.describe("Store-Company Isolation & Integrity", () => {
  /**
   * BR-101: Cannot create store for non-existent company
   *
   * WHY: Referential integrity
   * RISK: Orphaned stores, database corruption
   * VALIDATES: FK constraint enforcement
   */
  test("[P0-BR-101] Cannot create store for non-existent company", async ({
    superadminApiRequest,
  }) => {
    // GIVEN: A non-existent company ID
    const fakeCompanyId = "00000000-0000-0000-0000-000000000000";

    // WHEN: Attempting to create store for non-existent company
    const storeData = {
      name: "Orphaned Store",
      timezone: "America/New_York",
      status: "ACTIVE",
    };

    const response = await superadminApiRequest.post(
      `/api/companies/${fakeCompanyId}/stores`,
      storeData,
    );

    // THEN: Request fails with 404
    expect(response.status()).toBe(404);

    const body = await response.json();

    // AND: Error message indicates company not found
    expect(body.error).toBeDefined();
    expect(body.message).toContain("Company");
    expect(body.message).toContain("not found");
  });

  /**
   * BR-102: Corporate admin sees ONLY their company's stores
   *
   * WHY: Company isolation security
   * RISK: Data leak to competitors
   * VALIDATES: GET /api/companies/{companyId}/stores filtering
   */
  test("[P0-BR-102] Corporate admin sees ONLY their company's stores", async ({
    corporateAdminApiRequest,
    corporateAdminUser,
    prismaClient,
  }) => {
    // GIVEN: Corporate admin's company with stores
    const ownStore = await createStore(prismaClient, {
      company_id: corporateAdminUser.company_id,
      name: "Own Company Store",
    });

    // AND: Another company with stores
    const otherOwner = await createUser(prismaClient);
    const otherCompany = await createCompany(prismaClient, {
      name: "Other Company",
      owner_user_id: otherOwner.user_id,
    });
    const otherStore = await createStore(prismaClient, {
      company_id: otherCompany.company_id,
      name: "Other Company Store",
    });

    // WHEN: Corporate admin requests their company's stores
    const response = await corporateAdminApiRequest.get(
      `/api/companies/${corporateAdminUser.company_id}/stores`,
    );

    // THEN: Request succeeds
    expect(response.status()).toBe(200);

    const body = await response.json();

    // AND: Only own company's stores are returned
    const storeIds = body.data.map((s: any) => s.store_id);
    expect(storeIds).toContain(ownStore.store_id);
    expect(storeIds).not.toContain(otherStore.store_id);

    // AND: All returned stores belong to the correct company
    body.data.forEach((store: any) => {
      expect(store.company_id).toBe(corporateAdminUser.company_id);
    });
  });

  /**
   * BR-103: System admin sees stores from ALL companies (including INACTIVE)
   *
   * WHY: System admins manage all entities regardless of status
   * RISK: INACTIVE companies' stores hidden from admin
   * VALIDATES: No status filtering in GET /api/stores
   */
  test("[P0-BR-103] System admin sees stores from both ACTIVE and INACTIVE companies", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: ACTIVE company with store
    const activeOwner = await createUser(prismaClient);
    const activeCompany = await createCompany(prismaClient, {
      name: "Active Company",
      status: "ACTIVE",
      owner_user_id: activeOwner.user_id,
    });
    const activeStore = await createStore(prismaClient, {
      company_id: activeCompany.company_id,
      name: "Store in Active Company",
    });

    // AND: INACTIVE company with store
    const inactiveOwner = await createUser(prismaClient);
    const inactiveCompany = await createCompany(prismaClient, {
      name: "Inactive Company",
      status: "INACTIVE",
      owner_user_id: inactiveOwner.user_id,
    });
    const inactiveStore = await createStore(prismaClient, {
      company_id: inactiveCompany.company_id,
      name: "Store in Inactive Company",
    });

    // WHEN: System admin requests all stores
    const response = await superadminApiRequest.get("/api/stores");

    // THEN: Request succeeds
    expect(response.status()).toBe(200);

    const body = await response.json();

    // AND: Stores from BOTH active and inactive companies are returned
    const storeIds = body.data.map((s: any) => s.store_id);
    expect(storeIds).toContain(activeStore.store_id);
    expect(storeIds).toContain(inactiveStore.store_id);
  });

  /**
   * BR-104: Soft-deleted companies' stores are EXCLUDED
   *
   * WHY: Soft-deleted data should not appear in lists
   * RISK: Confusion - deleted company's stores still visible
   * VALIDATES: deleted_at IS NULL filter
   */
  test("[P0-BR-104] Soft-deleted companies' stores are excluded from list", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: Company with store
    const companyOwner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      name: "To Be Deleted Company",
      owner_user_id: companyOwner.user_id,
    });
    const store = await createStore(prismaClient, {
      company_id: company.company_id,
      name: "Store in Deleted Company",
    });

    // WHEN: Company is soft-deleted
    await prismaClient.company.update({
      where: { company_id: company.company_id },
      data: { deleted_at: new Date() },
    });

    // AND: System admin requests all stores
    const response = await superadminApiRequest.get("/api/stores");

    // THEN: Request succeeds
    expect(response.status()).toBe(200);

    const body = await response.json();

    // AND: Store from soft-deleted company is NOT in the list
    const storeIds = body.data.map((s: any) => s.store_id);
    expect(storeIds).not.toContain(store.store_id);

    // AND: Store still exists in database (not hard-deleted)
    const dbStore = await prismaClient.store.findUnique({
      where: { store_id: store.store_id },
    });
    expect(dbStore).not.toBeNull();
  });

  /**
   * BR-105: When company is hard-deleted, stores CASCADE delete
   *
   * WHY: Data cleanup, prevent orphaned records
   * RISK: Orphaned stores in database
   * VALIDATES: Prisma onDelete: Cascade behavior
   */
  test("[P0-BR-105] Hard deleting company cascades to delete stores", async ({
    prismaClient,
  }) => {
    // GIVEN: Company with store
    const companyOwner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      name: "Company to Hard Delete",
      owner_user_id: companyOwner.user_id,
    });
    const store = await createStore(prismaClient, {
      company_id: company.company_id,
      name: "Store to be Cascaded",
    });

    // Verify store exists
    const beforeStore = await prismaClient.store.findUnique({
      where: { store_id: store.store_id },
    });
    expect(beforeStore).not.toBeNull();

    // WHEN: Company is hard-deleted
    await prismaClient.company.delete({
      where: { company_id: company.company_id },
    });

    // THEN: Store is also deleted (CASCADE)
    const afterStore = await prismaClient.store.findUnique({
      where: { store_id: store.store_id },
    });
    expect(afterStore).toBeNull();

    // AND: Company is deleted
    const deletedCompany = await prismaClient.company.findUnique({
      where: { company_id: company.company_id },
    });
    expect(deletedCompany).toBeNull();
  });

  /**
   * BR-106: Store created by system admin can be managed by corporate admin
   *
   * WHY: Cross-role workflow (system admin creates, owner manages)
   * RISK: Permissions conflict after cross-role creation
   * VALIDATES: Role boundaries don't block legitimate access
   */
  test("[P0-BR-106] System admin creates store, corporate admin can manage it", async ({
    superadminApiRequest,
    corporateAdminApiRequest,
    corporateAdminUser,
    prismaClient,
  }) => {
    // GIVEN: System admin creates store for corporate admin's company
    const storeData = {
      name: "Cross-Role Created Store",
      timezone: "America/Denver",
      status: "ACTIVE",
    };

    const createResponse = await superadminApiRequest.post(
      `/api/companies/${corporateAdminUser.company_id}/stores`,
      storeData,
    );

    expect(createResponse.status()).toBe(201);
    const createdStore = await createResponse.json();

    // WHEN: Corporate admin updates the store
    const updateData = {
      name: "Updated by Corporate Admin",
      status: "INACTIVE",
    };

    const updateResponse = await corporateAdminApiRequest.put(
      `/api/stores/${createdStore.store_id}`,
      updateData,
    );

    // THEN: Update succeeds
    expect(updateResponse.status()).toBe(200);

    const updatedStore = await updateResponse.json();

    // AND: Store is updated correctly
    expect(updatedStore.name).toBe("Updated by Corporate Admin");
    expect(updatedStore.status).toBe("INACTIVE");

    // AND: Corporate admin can read the store
    const readResponse = await corporateAdminApiRequest.get(
      `/api/stores/${createdStore.store_id}`,
    );

    expect(readResponse.status()).toBe(200);

    const readStore = await readResponse.json();
    expect(readStore.name).toBe("Updated by Corporate Admin");
  });
});
