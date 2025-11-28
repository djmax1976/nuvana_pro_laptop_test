import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  UserAdminService,
  type AuditContext,
  type CreateUserInput,
} from "../../../backend/src/services/user-admin.service";
import {
  generatePublicId,
  PUBLIC_ID_PREFIXES,
} from "../../../backend/src/utils/public-id";
import bcrypt from "bcrypt";

/**
 * Unit Tests: User Deletion Validation
 *
 * CRITICAL TEST COVERAGE:
 * - Cannot delete ACTIVE user
 * - Cannot delete CLIENT_OWNER with ACTIVE companies
 * - Cannot delete CLIENT_OWNER with ACTIVE stores (even if company is inactive)
 * - CAN delete CLIENT_OWNER when all companies and stores are inactive
 *
 * These tests ensure we don't accidentally cascade-delete active business data.
 *
 * NOTE: These tests require DATABASE_URL to be set. They will be skipped in CI
 * unit test jobs where no database is available.
 */

// Check if database is available before initializing Prisma
const hasDatabaseUrl = !!process.env.DATABASE_URL;
const prisma = hasDatabaseUrl
  ? new PrismaClient()
  : (null as unknown as PrismaClient);
const userAdminService = new UserAdminService();

// Shared test data
let testAdminUser: any;
let clientOwnerRoleId: string;

const createdUserIds: string[] = [];
const createdCompanyIds: string[] = [];
const createdStoreIds: string[] = [];

const auditContext: AuditContext = {
  userId: "",
  userEmail: "test-admin@test.com",
  userRoles: ["SUPERADMIN"],
  ipAddress: "127.0.0.1",
  userAgent: "vitest",
};

// Global setup - only run if database is available
beforeAll(async () => {
  if (!hasDatabaseUrl) return;
  // Create a test admin user for audit context
  const hashedPassword = await bcrypt.hash("TestPassword123!", 10);
  testAdminUser = await prisma.user.create({
    data: {
      public_id: generatePublicId(PUBLIC_ID_PREFIXES.USER),
      email: `deletion-test-admin-${Date.now()}@test.com`,
      name: "Deletion Test Admin",
      password_hash: hashedPassword,
      status: "ACTIVE",
    },
  });
  createdUserIds.push(testAdminUser.user_id);
  auditContext.userId = testAdminUser.user_id;

  // Get CLIENT_OWNER role ID
  const clientOwnerRole = await prisma.role.findUnique({
    where: { code: "CLIENT_OWNER" },
  });
  if (!clientOwnerRole) {
    throw new Error("CLIENT_OWNER role not found - run RBAC seed first");
  }
  clientOwnerRoleId = clientOwnerRole.role_id;
});

// Global cleanup - only run if database is available
afterAll(async () => {
  if (!hasDatabaseUrl) return;
  // Cleanup stores first
  for (const storeId of createdStoreIds) {
    try {
      await prisma.store.delete({ where: { store_id: storeId } });
    } catch (e) {
      // Ignore
    }
  }

  // Cleanup companies
  for (const companyId of createdCompanyIds) {
    try {
      await prisma.store.deleteMany({ where: { company_id: companyId } });
      await prisma.company.delete({ where: { company_id: companyId } });
    } catch (e) {
      // Ignore
    }
  }

  // Cleanup users
  for (const userId of createdUserIds) {
    try {
      await prisma.userRole.deleteMany({ where: { user_id: userId } });
      await prisma.user.delete({ where: { user_id: userId } });
    } catch (e) {
      // Ignore cleanup errors
    }
  }

  await prisma.$disconnect();
});

describe.skipIf(!hasDatabaseUrl)(
  "User Deletion Validation - Basic Rules",
  () => {
    it("should NOT allow deleting an ACTIVE user", async () => {
      // Create an active user
      const hashedPassword = await bcrypt.hash("TestPassword123!", 10);
      const activeUser = await prisma.user.create({
        data: {
          public_id: generatePublicId(PUBLIC_ID_PREFIXES.USER),
          email: `active-user-${Date.now()}@test.com`,
          name: "Active User",
          password_hash: hashedPassword,
          status: "ACTIVE",
        },
      });
      createdUserIds.push(activeUser.user_id);

      // Attempt to delete should fail
      await expect(
        userAdminService.deleteUser(activeUser.user_id, auditContext),
      ).rejects.toThrow("Cannot delete ACTIVE user");

      // Verify user still exists
      const userStillExists = await prisma.user.findUnique({
        where: { user_id: activeUser.user_id },
      });
      expect(userStillExists).not.toBeNull();
    });

    it("should allow deleting an INACTIVE user without companies", async () => {
      // Create an inactive user
      const hashedPassword = await bcrypt.hash("TestPassword123!", 10);
      const inactiveUser = await prisma.user.create({
        data: {
          public_id: generatePublicId(PUBLIC_ID_PREFIXES.USER),
          email: `inactive-user-${Date.now()}@test.com`,
          name: "Inactive User",
          password_hash: hashedPassword,
          status: "INACTIVE",
        },
      });
      // Don't add to cleanup - we're testing deletion

      // Delete should succeed
      const result = await userAdminService.deleteUser(
        inactiveUser.user_id,
        auditContext,
      );
      expect(result.user_id).toBe(inactiveUser.user_id);

      // Verify user was deleted
      const userDeleted = await prisma.user.findUnique({
        where: { user_id: inactiveUser.user_id },
      });
      expect(userDeleted).toBeNull();
    });
  },
);

describe.skipIf(!hasDatabaseUrl)(
  "User Deletion Validation - CLIENT_OWNER with Companies",
  () => {
    it("should NOT allow deleting CLIENT_OWNER with ACTIVE company", async () => {
      // Create CLIENT_OWNER with company using the service
      const uniqueEmail = `co-active-company-${Date.now()}@test.com`;
      const companyName = `Active Company Test ${Date.now()}`;

      const input: CreateUserInput = {
        email: uniqueEmail,
        name: "Client Owner with Active Company",
        password: "TestPassword123!",
        roles: [
          {
            role_id: clientOwnerRoleId,
            scope_type: "COMPANY",
          },
        ],
        companyName: companyName,
        companyAddress: "123 Test St",
      };

      const createdUser = await userAdminService.createUser(
        input,
        auditContext,
      );
      createdUserIds.push(createdUser.user_id);

      // Find the company
      const company = await prisma.company.findFirst({
        where: { name: companyName },
      });
      if (company) {
        createdCompanyIds.push(company.company_id);
      }

      // Set user to INACTIVE (but company stays ACTIVE)
      await prisma.user.update({
        where: { user_id: createdUser.user_id },
        data: { status: "INACTIVE" },
      });

      // Attempt to delete should fail because company is still ACTIVE
      await expect(
        userAdminService.deleteUser(createdUser.user_id, auditContext),
      ).rejects.toThrow(/active company/i);

      // Verify user and company still exist
      const userStillExists = await prisma.user.findUnique({
        where: { user_id: createdUser.user_id },
      });
      expect(userStillExists).not.toBeNull();

      const companyStillExists = await prisma.company.findUnique({
        where: { company_id: company?.company_id },
      });
      expect(companyStillExists).not.toBeNull();
    });

    it("should NOT allow deleting CLIENT_OWNER with ACTIVE stores (even if company is inactive)", async () => {
      // Create CLIENT_OWNER with company
      const uniqueEmail = `co-active-store-${Date.now()}@test.com`;
      const companyName = `Active Store Test Company ${Date.now()}`;

      const input: CreateUserInput = {
        email: uniqueEmail,
        name: "Client Owner with Active Store",
        password: "TestPassword123!",
        roles: [
          {
            role_id: clientOwnerRoleId,
            scope_type: "COMPANY",
          },
        ],
        companyName: companyName,
        companyAddress: "456 Test Ave",
      };

      const createdUser = await userAdminService.createUser(
        input,
        auditContext,
      );
      createdUserIds.push(createdUser.user_id);

      // Find the company
      const company = await prisma.company.findFirst({
        where: { name: companyName },
      });
      if (company) {
        createdCompanyIds.push(company.company_id);
      }

      // Create a store under this company
      const store = await prisma.store.create({
        data: {
          public_id: generatePublicId(PUBLIC_ID_PREFIXES.STORE),
          name: `Test Store ${Date.now()}`,
          company_id: company!.company_id,
          status: "ACTIVE", // Store is ACTIVE
        },
      });
      createdStoreIds.push(store.store_id);

      // Set user to INACTIVE and company to INACTIVE, but store stays ACTIVE
      await prisma.user.update({
        where: { user_id: createdUser.user_id },
        data: { status: "INACTIVE" },
      });
      await prisma.company.update({
        where: { company_id: company!.company_id },
        data: { status: "INACTIVE" },
      });

      // Attempt to delete should fail because store is still ACTIVE
      await expect(
        userAdminService.deleteUser(createdUser.user_id, auditContext),
      ).rejects.toThrow(/active store/i);

      // Verify everything still exists
      const userStillExists = await prisma.user.findUnique({
        where: { user_id: createdUser.user_id },
      });
      expect(userStillExists).not.toBeNull();

      const storeStillExists = await prisma.store.findUnique({
        where: { store_id: store.store_id },
      });
      expect(storeStillExists).not.toBeNull();
    });

    it("should ALLOW deleting CLIENT_OWNER when company and all stores are INACTIVE", async () => {
      // Create CLIENT_OWNER with company
      const uniqueEmail = `co-all-inactive-${Date.now()}@test.com`;
      const companyName = `All Inactive Test Company ${Date.now()}`;

      const input: CreateUserInput = {
        email: uniqueEmail,
        name: "Client Owner All Inactive",
        password: "TestPassword123!",
        roles: [
          {
            role_id: clientOwnerRoleId,
            scope_type: "COMPANY",
          },
        ],
        companyName: companyName,
        companyAddress: "789 Test Blvd",
      };

      const createdUser = await userAdminService.createUser(
        input,
        auditContext,
      );
      // Don't add to cleanup - we're testing deletion

      // Find the company
      const company = await prisma.company.findFirst({
        where: { name: companyName },
      });

      // Create a store under this company
      const store = await prisma.store.create({
        data: {
          public_id: generatePublicId(PUBLIC_ID_PREFIXES.STORE),
          name: `Inactive Store ${Date.now()}`,
          company_id: company!.company_id,
          status: "ACTIVE",
        },
      });

      // Set everything to INACTIVE
      await prisma.user.update({
        where: { user_id: createdUser.user_id },
        data: { status: "INACTIVE" },
      });
      await prisma.company.update({
        where: { company_id: company!.company_id },
        data: { status: "INACTIVE" },
      });
      await prisma.store.update({
        where: { store_id: store.store_id },
        data: { status: "INACTIVE" },
      });

      // Delete should succeed
      const result = await userAdminService.deleteUser(
        createdUser.user_id,
        auditContext,
      );
      expect(result.user_id).toBe(createdUser.user_id);

      // Verify user was deleted
      const userDeleted = await prisma.user.findUnique({
        where: { user_id: createdUser.user_id },
      });
      expect(userDeleted).toBeNull();

      // Verify company was cascade deleted
      const companyDeleted = await prisma.company.findUnique({
        where: { company_id: company!.company_id },
      });
      expect(companyDeleted).toBeNull();

      // Verify store was cascade deleted
      const storeDeleted = await prisma.store.findUnique({
        where: { store_id: store.store_id },
      });
      expect(storeDeleted).toBeNull();
    });
  },
);

describe.skipIf(!hasDatabaseUrl)(
  "User Deletion Validation - Multiple Companies/Stores",
  () => {
    it("should NOT allow deletion if ANY company is active", async () => {
      // Create CLIENT_OWNER with company
      const uniqueEmail = `co-multi-company-${Date.now()}@test.com`;
      const companyName1 = `Multi Company 1 ${Date.now()}`;

      const input: CreateUserInput = {
        email: uniqueEmail,
        name: "Client Owner Multi Company",
        password: "TestPassword123!",
        roles: [
          {
            role_id: clientOwnerRoleId,
            scope_type: "COMPANY",
          },
        ],
        companyName: companyName1,
        companyAddress: "111 Multi St",
      };

      const createdUser = await userAdminService.createUser(
        input,
        auditContext,
      );
      createdUserIds.push(createdUser.user_id);

      // Find the first company
      const company1 = await prisma.company.findFirst({
        where: { name: companyName1 },
      });
      if (company1) {
        createdCompanyIds.push(company1.company_id);
      }

      // Create a second company owned by the same user
      const company2 = await prisma.company.create({
        data: {
          public_id: generatePublicId(PUBLIC_ID_PREFIXES.COMPANY),
          name: `Multi Company 2 ${Date.now()}`,
          address: "222 Multi St",
          owner_user_id: createdUser.user_id,
          status: "ACTIVE", // Second company is ACTIVE
        },
      });
      createdCompanyIds.push(company2.company_id);

      // Set user and first company to INACTIVE
      await prisma.user.update({
        where: { user_id: createdUser.user_id },
        data: { status: "INACTIVE" },
      });
      await prisma.company.update({
        where: { company_id: company1!.company_id },
        data: { status: "INACTIVE" },
      });

      // Attempt to delete should fail because company2 is still ACTIVE
      await expect(
        userAdminService.deleteUser(createdUser.user_id, auditContext),
      ).rejects.toThrow(/active company/i);
    });

    it("should include company name in error message", async () => {
      // Create CLIENT_OWNER with company
      const uniqueEmail = `co-error-msg-${Date.now()}@test.com`;
      const companyName = `Error Message Test Company ${Date.now()}`;

      const input: CreateUserInput = {
        email: uniqueEmail,
        name: "Error Message Test Owner",
        password: "TestPassword123!",
        roles: [
          {
            role_id: clientOwnerRoleId,
            scope_type: "COMPANY",
          },
        ],
        companyName: companyName,
        companyAddress: "333 Error St",
      };

      const createdUser = await userAdminService.createUser(
        input,
        auditContext,
      );
      createdUserIds.push(createdUser.user_id);

      const company = await prisma.company.findFirst({
        where: { name: companyName },
      });
      if (company) {
        createdCompanyIds.push(company.company_id);
      }

      // Set user to INACTIVE (company stays ACTIVE)
      await prisma.user.update({
        where: { user_id: createdUser.user_id },
        data: { status: "INACTIVE" },
      });

      // Error message should include the company name
      await expect(
        userAdminService.deleteUser(createdUser.user_id, auditContext),
      ).rejects.toThrow(companyName);
    });
  },
);
