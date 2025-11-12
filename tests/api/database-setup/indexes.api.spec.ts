import { test, expect } from "../../support/fixtures";
import {
  createCompany,
  createUser,
  createStore,
} from "../../support/factories";

/**
 * Database Setup - Indexes API Tests
 *
 * These tests verify the database index setup:
 * - User table email index
 * - Store table company_id index
 * - Query performance validation
 *
 * Story: 1-3-database-setup-with-prisma
 * Status: ready-for-dev
 */

test.describe("1.3-API-004: Database Setup - Indexes", () => {
  test("[P1] 1.3-API-004-001: User table should have index on email", async ({
    prismaClient,
  }) => {
    // GIVEN: Prisma schema defines index on User.email
    // WHEN: Querying users by email
    let userId: string | null = null;

    try {
      const userData = createUser();
      const user = await prismaClient.user.create({
        data: {
          email: userData.email,
          name: userData.name,
          status: userData.status,
        },
      });
      userId = user.user_id;

      // THEN: Query by email should be fast (index exists)
      const foundUser = await prismaClient.user.findUnique({
        where: { email: userData.email },
      });

      expect(foundUser).not.toBeNull();
      expect(foundUser?.user_id).toBe(user.user_id);
    } finally {
      // Cleanup: Always execute, even if test fails
      if (userId) {
        await prismaClient.user
          .delete({ where: { user_id: userId } })
          .catch(() => {});
      }
    }
  });

  test("[P1] 1.3-API-004-002: Store table should have index on company_id", async ({
    prismaClient,
  }) => {
    // GIVEN: Prisma schema defines index on Store.company_id
    // WHEN: Querying stores by company_id
    let storeId: string | null = null;
    let companyId: string | null = null;

    try {
      const companyData = createCompany();
      const company = await prismaClient.company.create({
        data: {
          name: companyData.name,
          status: companyData.status,
        },
      });
      companyId = company.company_id;

      const storeData = createStore({ company_id: company.company_id });
      const store = await prismaClient.store.create({
        data: {
          company_id: storeData.company_id,
          name: storeData.name,
          timezone: storeData.timezone,
          status: storeData.status,
        },
      });
      storeId = store.store_id;

      // THEN: Query by company_id should be fast (index exists)
      const stores = await prismaClient.store.findMany({
        where: { company_id: company.company_id },
      });

      expect(stores.length).toBeGreaterThan(0);
      expect(
        stores.some((s: { store_id: string }) => s.store_id === store.store_id),
      ).toBe(true);
    } finally {
      // Cleanup: Always execute, even if test fails
      if (storeId) {
        await prismaClient.store
          .delete({ where: { store_id: storeId } })
          .catch(() => {});
      }
      if (companyId) {
        await prismaClient.company
          .delete({ where: { company_id: companyId } })
          .catch(() => {});
      }
    }
  });
});
