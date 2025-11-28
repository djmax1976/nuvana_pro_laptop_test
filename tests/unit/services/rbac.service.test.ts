import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { RBACService } from "../../../backend/src/services/rbac.service";
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
 * Unit Tests: RBAC Service - Permission Checking
 *
 * CRITICAL TEST COVERAGE:
 * - CLIENT_OWNER permission scope validation
 * - COMPANY scope permissions require company_id in user_role
 * - Permission checks for CLIENT_EMPLOYEE_* permissions
 *
 * These tests ensure CLIENT_OWNER can access their company's resources
 * after user creation - the bug where permissions failed due to missing
 * company_id in user_role.
 *
 * NOTE: These tests require DATABASE_URL to be set. They will be skipped in CI
 * unit test jobs where no database is available.
 */

// Check if database is available before initializing Prisma
const hasDatabaseUrl = !!process.env.DATABASE_URL;
const prisma = hasDatabaseUrl
  ? new PrismaClient()
  : (null as unknown as PrismaClient);
const rbacService = new RBACService();
const userAdminService = new UserAdminService();

// Shared test data
let testAdminUser: any;
let clientOwnerRoleId: string;
let testClientOwnerUserId: string;
let testCompanyId: string;

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
      email: `rbac-test-admin-${Date.now()}@test.com`,
      name: "RBAC Test Admin",
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

  // Create a CLIENT_OWNER user with company for permission testing
  const uniqueEmail = `rbac-client-owner-${Date.now()}@test.com`;
  const companyName = `RBAC Test Company ${Date.now()}`;

  const input: CreateUserInput = {
    email: uniqueEmail,
    name: "RBAC Test Client Owner",
    password: "TestPassword123!",
    roles: [
      {
        role_id: clientOwnerRoleId,
        scope_type: "COMPANY",
      },
    ],
    companyName: companyName,
    companyAddress: "123 RBAC Test Street",
  };

  const result = await userAdminService.createUser(input, auditContext);
  testClientOwnerUserId = result.user_id;
  createdUserIds.push(testClientOwnerUserId);

  const company = await prisma.company.findFirst({
    where: { name: companyName },
  });
  if (company) {
    testCompanyId = company.company_id;
    createdCompanyIds.push(testCompanyId);
  }

  // Clear any cached permissions for clean test
  await rbacService.invalidateUserRolesCache(testClientOwnerUserId);
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

  // Cleanup users
  for (const userId of createdUserIds) {
    try {
      await prisma.userRole.deleteMany({ where: { user_id: userId } });
      await prisma.user.delete({ where: { user_id: userId } });
    } catch (e) {
      // Ignore cleanup errors
    }
  }

  // Cleanup companies
  for (const companyId of createdCompanyIds) {
    try {
      await prisma.store.deleteMany({ where: { company_id: companyId } });
      await prisma.company.delete({ where: { company_id: companyId } });
    } catch (e) {
      // Ignore cleanup errors
    }
  }

  await prisma.$disconnect();
});

describe.skipIf(!hasDatabaseUrl)(
  "RBACService - CLIENT_OWNER Permission Checks",
  () => {
    describe("getUserRoles - CLIENT_OWNER role data", () => {
      it("should return CLIENT_OWNER role with company_id populated", async () => {
        const roles = await rbacService.getUserRoles(testClientOwnerUserId);

        expect(roles.length).toBeGreaterThan(0);

        const clientOwnerRole = roles.find(
          (r) => r.role_code === "CLIENT_OWNER",
        );
        expect(clientOwnerRole).toBeDefined();

        // CRITICAL: company_id must be set for permission scope checking
        expect(clientOwnerRole?.company_id).not.toBeNull();
        expect(clientOwnerRole?.company_id).toBe(testCompanyId);
        expect(clientOwnerRole?.scope).toBe("COMPANY");
      });

      it("should include CLIENT_EMPLOYEE_READ in role permissions", async () => {
        const roles = await rbacService.getUserRoles(testClientOwnerUserId);
        const clientOwnerRole = roles.find(
          (r) => r.role_code === "CLIENT_OWNER",
        );

        expect(clientOwnerRole?.permissions).toContain("CLIENT_EMPLOYEE_READ");
      });

      it("should include all CLIENT permissions in role permissions", async () => {
        const roles = await rbacService.getUserRoles(testClientOwnerUserId);
        const clientOwnerRole = roles.find(
          (r) => r.role_code === "CLIENT_OWNER",
        );

        const requiredPermissions = [
          "CLIENT_DASHBOARD_ACCESS",
          "CLIENT_EMPLOYEE_CREATE",
          "CLIENT_EMPLOYEE_READ",
          "CLIENT_EMPLOYEE_DELETE",
        ];

        for (const perm of requiredPermissions) {
          expect(clientOwnerRole?.permissions).toContain(perm);
        }
      });
    });

    describe("checkPermission - CLIENT_OWNER scope validation", () => {
      it("should grant CLIENT_EMPLOYEE_READ for own company", async () => {
        const hasPermission = await rbacService.checkPermission(
          testClientOwnerUserId,
          "CLIENT_EMPLOYEE_READ" as any,
          { companyId: testCompanyId },
        );

        expect(hasPermission).toBe(true);
      });

      it("should grant CLIENT_EMPLOYEE_CREATE for own company", async () => {
        const hasPermission = await rbacService.checkPermission(
          testClientOwnerUserId,
          "CLIENT_EMPLOYEE_CREATE" as any,
          { companyId: testCompanyId },
        );

        expect(hasPermission).toBe(true);
      });

      it("should grant CLIENT_DASHBOARD_ACCESS for own company", async () => {
        const hasPermission = await rbacService.checkPermission(
          testClientOwnerUserId,
          "CLIENT_DASHBOARD_ACCESS" as any,
          { companyId: testCompanyId },
        );

        expect(hasPermission).toBe(true);
      });

      it("should deny permission for different company", async () => {
        // Create another company to test cross-company access denial
        // Company requires owner_user_id - use the test admin
        const otherCompany = await prisma.company.create({
          data: {
            public_id: generatePublicId(PUBLIC_ID_PREFIXES.COMPANY),
            name: `Other Company ${Date.now()}`,
            address: "Different Address",
            status: "ACTIVE",
            owner_user_id: testAdminUser.user_id,
          },
        });
        createdCompanyIds.push(otherCompany.company_id);

        const hasPermission = await rbacService.checkPermission(
          testClientOwnerUserId,
          "CLIENT_EMPLOYEE_READ" as any,
          { companyId: otherCompany.company_id },
        );

        expect(hasPermission).toBe(false);
      });

      it("should grant permission when no scope is provided (service handles filtering)", async () => {
        // When no companyId/storeId is provided, COMPANY scope roles should still pass
        // because the service layer handles data filtering
        const hasPermission = await rbacService.checkPermission(
          testClientOwnerUserId,
          "CLIENT_EMPLOYEE_READ" as any,
          {}, // Empty scope
        );

        expect(hasPermission).toBe(true);
      });
    });

    describe("checkPermission - COMPANY scope hierarchy", () => {
      let testStoreId: string;

      beforeAll(async () => {
        // Create a store under the test company
        // Store doesn't have 'address' field - use location_json instead
        const store = await prisma.store.create({
          data: {
            public_id: generatePublicId(PUBLIC_ID_PREFIXES.STORE),
            name: `Test Store ${Date.now()}`,
            company_id: testCompanyId,
            status: "ACTIVE",
          },
        });
        testStoreId = store.store_id;
        createdStoreIds.push(testStoreId);
      });

      it("should grant STORE_READ for store under own company", async () => {
        const hasPermission = await rbacService.checkPermission(
          testClientOwnerUserId,
          "STORE_READ" as any,
          { storeId: testStoreId },
        );

        expect(hasPermission).toBe(true);
      });

      it("should grant permission when accessing store with company scope", async () => {
        const hasPermission = await rbacService.checkPermission(
          testClientOwnerUserId,
          "STORE_READ" as any,
          { companyId: testCompanyId, storeId: testStoreId },
        );

        expect(hasPermission).toBe(true);
      });
    });
  },
);

describe.skipIf(!hasDatabaseUrl)(
  "RBACService - Missing company_id Regression Prevention",
  () => {
    it("should deny COMPANY-scoped permission if user_role.company_id is NULL", async () => {
      // Create a user with CLIENT_OWNER role but WITHOUT company_id in user_role
      // This simulates the bug before the fix
      const hashedPassword = await bcrypt.hash("TestPassword123!", 10);
      const buggyUser = await prisma.user.create({
        data: {
          public_id: generatePublicId(PUBLIC_ID_PREFIXES.USER),
          email: `buggy-user-${Date.now()}@test.com`,
          name: "Buggy User (No Company Link)",
          password_hash: hashedPassword,
          status: "ACTIVE",
        },
      });
      createdUserIds.push(buggyUser.user_id);

      // Manually create user_role WITHOUT company_id (simulating the old bug)
      await prisma.userRole.create({
        data: {
          user_id: buggyUser.user_id,
          role_id: clientOwnerRoleId,
          company_id: null, // BUG: This was the issue
          assigned_by: testAdminUser.user_id, // Use valid user
        },
      });

      // Clear cache
      await rbacService.invalidateUserRolesCache(buggyUser.user_id);

      // Create a company to test against (with owner)
      const testCompany = await prisma.company.create({
        data: {
          public_id: generatePublicId(PUBLIC_ID_PREFIXES.COMPANY),
          name: `Bug Test Company ${Date.now()}`,
          address: "Bug Test Address",
          status: "ACTIVE",
          owner_user_id: testAdminUser.user_id,
        },
      });
      createdCompanyIds.push(testCompany.company_id);

      // Permission check should FAIL because company_id is null in user_role
      const hasPermission = await rbacService.checkPermission(
        buggyUser.user_id,
        "CLIENT_EMPLOYEE_READ" as any,
        { companyId: testCompany.company_id },
      );

      // This test documents the bug behavior - permission is denied
      // when company_id is not linked in user_role
      expect(hasPermission).toBe(false);
    });
  },
);
