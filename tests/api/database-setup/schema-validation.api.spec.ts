import { test, expect } from "../../support/fixtures";
import {
  createCompany,
  createUser,
  createStore,
} from "../../support/factories";
import {
  generatePublicId,
  PUBLIC_ID_PREFIXES,
} from "../../../backend/src/utils/public-id";

/**
 * Database Setup - Schema Validation API Tests
 *
 * These tests verify the database schema validation:
 * - User, Company, Store model field validation
 * - Unique constraints
 * - Foreign key relationships
 * - Cascade delete behavior
 *
 * Story: 1-3-database-setup-with-prisma
 * Status: ready-for-dev
 */

test.describe("1.3-API-002: Database Setup - Schema Validation", () => {
  test("[P0] 1.3-API-002-001: User model should have required fields", async ({
    prismaClient,
  }) => {
    // GIVEN: Prisma schema defines User model
    // WHEN: Creating a User with required fields
    let userId: string | null = null;

    try {
      const userData = createUser();

      // THEN: User should be created successfully
      const user = await prismaClient.user.create({
        data: {
          public_id: userData.public_id,
          email: userData.email,
          name: userData.name,
          auth_provider_id: userData.auth_provider_id,
          status: userData.status,
        },
      });
      userId = user.user_id;

      expect(user).toHaveProperty("user_id");
      expect(user).toHaveProperty("email", userData.email);
      expect(user).toHaveProperty("name", userData.name);
      expect(user).toHaveProperty("created_at");
      expect(user).toHaveProperty("updated_at");
    } finally {
      // Cleanup: Always execute, even if test fails
      if (userId) {
        await prismaClient.user
          .delete({ where: { user_id: userId } })
          .catch(() => {});
      }
    }
  });

  test("[P0] 1.3-API-002-002: Company model should have required fields", async ({
    prismaClient,
  }) => {
    // GIVEN: Prisma schema defines Company model
    // WHEN: Creating a Company with required fields
    let companyId: string | null = null;

    try {
      const companyData = createCompany();

      // THEN: Company should be created successfully
      const company = await prismaClient.company.create({
        data: {
          public_id: companyData.public_id,
          name: companyData.name,
          status: companyData.status,
        },
      });
      companyId = company.company_id;

      expect(company).toHaveProperty("company_id");
      expect(company).toHaveProperty("name", companyData.name);
      expect(company).toHaveProperty("status", companyData.status);
      expect(company).toHaveProperty("created_at");
      expect(company).toHaveProperty("updated_at");
    } finally {
      // Cleanup: Always execute, even if test fails
      if (companyId) {
        await prismaClient.company
          .delete({ where: { company_id: companyId } })
          .catch(() => {});
      }
    }
  });

  test("[P0] 1.3-API-002-003: Store model should have required fields and foreign key", async ({
    prismaClient,
  }) => {
    // GIVEN: Prisma schema defines Store model with Company foreign key
    // WHEN: Creating a Store with required fields and company_id
    let storeId: string | null = null;
    let companyId: string | null = null;

    try {
      // First create a company
      const companyData = createCompany();
      const company = await prismaClient.company.create({
        data: {
          public_id: companyData.public_id,
          name: companyData.name,
          status: companyData.status,
        },
      });
      companyId = company.company_id;

      const storeData = createStore({ company_id: company.company_id });

      // THEN: Store should be created successfully
      const store = await prismaClient.store.create({
        data: {
          public_id: storeData.public_id,
          company_id: storeData.company_id,
          name: storeData.name,
          location_json: storeData.location_json as any,
          timezone: storeData.timezone,
          status: storeData.status,
        },
      });
      storeId = store.store_id;

      expect(store).toHaveProperty("store_id");
      expect(store).toHaveProperty("company_id", company.company_id);
      expect(store).toHaveProperty("name", storeData.name);
      expect(store).toHaveProperty("timezone", storeData.timezone);
      expect(store).toHaveProperty("created_at");
      expect(store).toHaveProperty("updated_at");
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

  test("[P1] 1.3-API-002-004: User email should be unique", async ({
    prismaClient,
  }) => {
    // GIVEN: Prisma schema defines User model with unique email constraint
    // WHEN: Creating two users with the same email
    let userId: string | null = null;

    try {
      const userData = createUser();

      // Create first user
      const firstUser = await prismaClient.user.create({
        data: {
          public_id: userData.public_id,
          email: userData.email,
          name: userData.name,
          status: userData.status,
        },
      });
      userId = firstUser.user_id;

      // THEN: Creating second user with same email should fail
      await expect(
        prismaClient.user.create({
          data: {
            public_id: userData.public_id,
            email: userData.email,
            name: "Different Name",
            status: "ACTIVE",
          },
        }),
      ).rejects.toThrow();
    } finally {
      // Cleanup: Always execute, even if test fails
      if (userId) {
        await prismaClient.user
          .delete({ where: { user_id: userId } })
          .catch(() => {});
      }
    }
  });

  test("[P1] 1.3-API-002-005: Store should cascade delete when Company is deleted", async ({
    prismaClient,
  }) => {
    // GIVEN: Prisma schema defines Store with CASCADE delete on Company
    // WHEN: Creating a Company and Store, then deleting Company
    let companyId: string | null = null;
    let storeId: string | null = null;

    try {
      const companyData = createCompany();
      const company = await prismaClient.company.create({
        data: {
          public_id: companyData.public_id,
          name: companyData.name,
          status: companyData.status,
        },
      });
      companyId = company.company_id;

      const storeData = createStore({ company_id: company.company_id });
      const store = await prismaClient.store.create({
        data: {
          public_id: storeData.public_id,
          company_id: storeData.company_id,
          name: storeData.name,
          timezone: storeData.timezone,
          status: storeData.status,
        },
      });
      storeId = store.store_id;

      // Delete company
      await prismaClient.company.delete({
        where: { company_id: company.company_id },
      });

      // THEN: Store should be automatically deleted (CASCADE)
      const deletedStore = await prismaClient.store.findUnique({
        where: { store_id: store.store_id },
      });
      expect(deletedStore).toBeNull();

      // Verify company cleanup succeeded
      const deletedCompany = await prismaClient.company.findUnique({
        where: { company_id: company.company_id },
      });
      expect(deletedCompany).toBeNull();
    } finally {
      // Cleanup: Always execute, even if test fails
      // Note: Store should already be deleted by CASCADE, but clean up if test fails early
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
