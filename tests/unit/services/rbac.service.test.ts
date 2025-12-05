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
 */

const prisma = new PrismaClient();
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

// Global setup
beforeAll(async () => {
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

// Global cleanup
afterAll(async () => {
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

describe("RBACService - CLIENT_OWNER Permission Checks", () => {
  describe("getUserRoles - CLIENT_OWNER role data", () => {
    it("should return CLIENT_OWNER role with company_id populated", async () => {
      const roles = await rbacService.getUserRoles(testClientOwnerUserId);

      expect(roles.length).toBeGreaterThan(0);

      const clientOwnerRole = roles.find((r) => r.role_code === "CLIENT_OWNER");
      expect(clientOwnerRole).toBeDefined();

      // CRITICAL: company_id must be set for permission scope checking
      expect(clientOwnerRole?.company_id).not.toBeNull();
      expect(clientOwnerRole?.company_id).toBe(testCompanyId);
      expect(clientOwnerRole?.scope).toBe("COMPANY");
    });

    it("should include CLIENT_EMPLOYEE_READ in role permissions", async () => {
      const roles = await rbacService.getUserRoles(testClientOwnerUserId);
      const clientOwnerRole = roles.find((r) => r.role_code === "CLIENT_OWNER");

      expect(clientOwnerRole?.permissions).toContain("CLIENT_EMPLOYEE_READ");
    });

    it("should include all CLIENT permissions in role permissions", async () => {
      const roles = await rbacService.getUserRoles(testClientOwnerUserId);
      const clientOwnerRole = roles.find((r) => r.role_code === "CLIENT_OWNER");

      // CLIENT_OWNER must have ALL company and store scope permissions
      // This list must match rbac.seed.ts CLIENT_OWNER permissions
      const requiredPermissions = [
        // Client Dashboard
        "CLIENT_DASHBOARD_ACCESS",
        // Client Employee Management
        "CLIENT_EMPLOYEE_CREATE",
        "CLIENT_EMPLOYEE_READ",
        "CLIENT_EMPLOYEE_DELETE",
        // Cashier Management (Story 4.9)
        "CASHIER_CREATE",
        "CASHIER_READ",
        "CASHIER_UPDATE",
        "CASHIER_DELETE",
        // Client Role Management
        "CLIENT_ROLE_MANAGE",
        // Company Management
        "COMPANY_CREATE",
        "COMPANY_READ",
        "COMPANY_UPDATE",
        "COMPANY_DELETE",
        // Store Management
        "STORE_CREATE",
        "STORE_READ",
        "STORE_UPDATE",
        "STORE_DELETE",
        // Shift Operations
        "SHIFT_OPEN",
        "SHIFT_CLOSE",
        "SHIFT_READ",
        "SHIFT_RECONCILE",
        "SHIFT_REPORT_VIEW",
        // Transaction Management
        "TRANSACTION_CREATE",
        "TRANSACTION_READ",
        "TRANSACTION_IMPORT",
        // Inventory Management
        "INVENTORY_READ",
        "INVENTORY_ADJUST",
        "INVENTORY_ORDER",
        // Lottery Management
        "LOTTERY_PACK_RECEIVE",
        "LOTTERY_SHIFT_RECONCILE",
        "LOTTERY_REPORT",
        // Reports
        "REPORT_SHIFT",
        "REPORT_DAILY",
        "REPORT_ANALYTICS",
        "REPORT_EXPORT",
      ];

      for (const perm of requiredPermissions) {
        expect(
          clientOwnerRole?.permissions,
          `CLIENT_OWNER should have ${perm} permission`,
        ).toContain(perm);
      }
    });

    it("should include CASHIER_* permissions for cashier management", async () => {
      const roles = await rbacService.getUserRoles(testClientOwnerUserId);
      const clientOwnerRole = roles.find((r) => r.role_code === "CLIENT_OWNER");

      const cashierPermissions = [
        "CASHIER_CREATE",
        "CASHIER_READ",
        "CASHIER_UPDATE",
        "CASHIER_DELETE",
      ];

      for (const perm of cashierPermissions) {
        expect(
          clientOwnerRole?.permissions,
          `CLIENT_OWNER should have ${perm} for cashier management`,
        ).toContain(perm);
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
});

describe("RBACService - CLIENT_USER Permission Checks", () => {
  let testClientUserId: string;
  let clientUserRoleId: string;
  let testClientUserCompanyId: string;
  let testClientUserStoreId: string;

  beforeAll(async () => {
    // Get CLIENT_USER role ID
    const clientUserRole = await prisma.role.findUnique({
      where: { code: "CLIENT_USER" },
    });
    if (!clientUserRole) {
      throw new Error("CLIENT_USER role not found - run RBAC seed first");
    }
    clientUserRoleId = clientUserRole.role_id;

    // First, create a company and store for the CLIENT_USER
    // (CLIENT_USER requires pre-existing company_id and store_id, unlike CLIENT_OWNER)
    const company = await prisma.company.create({
      data: {
        public_id: generatePublicId(PUBLIC_ID_PREFIXES.COMPANY),
        name: `RBAC Client User Test Company ${Date.now()}`,
        address: "123 RBAC Client User Test Street",
        status: "ACTIVE",
        owner_user_id: testAdminUser.user_id,
      },
    });
    testClientUserCompanyId = company.company_id;
    createdCompanyIds.push(testClientUserCompanyId);

    const store = await prisma.store.create({
      data: {
        public_id: generatePublicId(PUBLIC_ID_PREFIXES.STORE),
        name: `RBAC Client User Test Store ${Date.now()}`,
        company_id: testClientUserCompanyId,
        status: "ACTIVE",
      },
    });
    testClientUserStoreId = store.store_id;
    createdStoreIds.push(testClientUserStoreId);

    // Create a CLIENT_USER user with pre-existing company and store
    const uniqueEmail = `rbac-client-user-${Date.now()}@test.com`;

    const input: CreateUserInput = {
      email: uniqueEmail,
      name: "RBAC Test Client User",
      password: "TestPassword123!",
      roles: [
        {
          role_id: clientUserRoleId,
          scope_type: "COMPANY",
          company_id: testClientUserCompanyId,
          store_id: testClientUserStoreId,
        },
      ],
    };

    const result = await userAdminService.createUser(input, auditContext);
    testClientUserId = result.user_id;
    createdUserIds.push(testClientUserId);

    // Clear any cached permissions for clean test
    await rbacService.invalidateUserRolesCache(testClientUserId);
  });

  it("should include CASHIER_READ in CLIENT_USER role permissions", async () => {
    const roles = await rbacService.getUserRoles(testClientUserId);
    const clientUserRole = roles.find((r) => r.role_code === "CLIENT_USER");

    expect(clientUserRole).toBeDefined();
    expect(
      clientUserRole?.permissions,
      "CLIENT_USER should have CASHIER_READ for viewing cashiers at terminals",
    ).toContain("CASHIER_READ");
  });

  it("should grant CASHIER_READ permission for own company", async () => {
    const hasPermission = await rbacService.checkPermission(
      testClientUserId,
      "CASHIER_READ" as any,
      { companyId: testClientUserCompanyId },
    );

    expect(hasPermission).toBe(true);
  });

  it("should NOT include CASHIER_CREATE/UPDATE/DELETE in CLIENT_USER permissions", async () => {
    const roles = await rbacService.getUserRoles(testClientUserId);
    const clientUserRole = roles.find((r) => r.role_code === "CLIENT_USER");

    expect(clientUserRole?.permissions).not.toContain("CASHIER_CREATE");
    expect(clientUserRole?.permissions).not.toContain("CASHIER_UPDATE");
    expect(clientUserRole?.permissions).not.toContain("CASHIER_DELETE");
  });

  it("should include all required CLIENT_USER permissions", async () => {
    const roles = await rbacService.getUserRoles(testClientUserId);
    const clientUserRole = roles.find((r) => r.role_code === "CLIENT_USER");

    // CLIENT_USER must have these permissions (matching rbac.seed.ts)
    const requiredPermissions = [
      "CLIENT_DASHBOARD_ACCESS",
      "COMPANY_READ",
      "STORE_READ",
      "SHIFT_READ",
      "TRANSACTION_READ",
      "INVENTORY_READ",
      "LOTTERY_REPORT",
      "REPORT_SHIFT",
      "REPORT_DAILY",
      "REPORT_ANALYTICS",
      "CLIENT_EMPLOYEE_CREATE",
      "CLIENT_EMPLOYEE_READ",
      "CLIENT_EMPLOYEE_DELETE",
      "CASHIER_READ", // Added for Story 4.9
    ];

    for (const perm of requiredPermissions) {
      expect(
        clientUserRole?.permissions,
        `CLIENT_USER should have ${perm} permission`,
      ).toContain(perm);
    }
  });
});

describe("RBACService - SHIFT_MANAGER Permission Checks", () => {
  let testShiftManagerUserId: string;
  let shiftManagerRoleId: string;
  let testShiftManagerStoreId: string;
  let testShiftManagerCompanyId: string;

  beforeAll(async () => {
    // Get SHIFT_MANAGER role ID
    const shiftManagerRole = await prisma.role.findUnique({
      where: { code: "SHIFT_MANAGER" },
    });
    if (!shiftManagerRole) {
      throw new Error("SHIFT_MANAGER role not found - run RBAC seed first");
    }
    shiftManagerRoleId = shiftManagerRole.role_id;

    // Create a company and store for the shift manager
    const company = await prisma.company.create({
      data: {
        public_id: generatePublicId(PUBLIC_ID_PREFIXES.COMPANY),
        name: `RBAC Shift Manager Test Company ${Date.now()}`,
        address: "123 Shift Manager Test Street",
        status: "ACTIVE",
        owner_user_id: testAdminUser.user_id,
      },
    });
    testShiftManagerCompanyId = company.company_id;
    createdCompanyIds.push(testShiftManagerCompanyId);

    const store = await prisma.store.create({
      data: {
        public_id: generatePublicId(PUBLIC_ID_PREFIXES.STORE),
        name: `RBAC Shift Manager Test Store ${Date.now()}`,
        company_id: testShiftManagerCompanyId,
        status: "ACTIVE",
      },
    });
    testShiftManagerStoreId = store.store_id;
    createdStoreIds.push(testShiftManagerStoreId);

    // Create a SHIFT_MANAGER user
    const hashedPassword = await bcrypt.hash("TestPassword123!", 10);
    const shiftManagerUser = await prisma.user.create({
      data: {
        public_id: generatePublicId(PUBLIC_ID_PREFIXES.USER),
        email: `rbac-shift-manager-${Date.now()}@test.com`,
        name: "RBAC Test Shift Manager",
        password_hash: hashedPassword,
        status: "ACTIVE",
      },
    });
    testShiftManagerUserId = shiftManagerUser.user_id;
    createdUserIds.push(testShiftManagerUserId);

    // Assign SHIFT_MANAGER role with store scope
    await prisma.userRole.create({
      data: {
        user_id: testShiftManagerUserId,
        role_id: shiftManagerRoleId,
        company_id: testShiftManagerCompanyId,
        store_id: testShiftManagerStoreId,
        assigned_by: testAdminUser.user_id,
      },
    });

    // Clear any cached permissions for clean test
    await rbacService.invalidateUserRolesCache(testShiftManagerUserId);
  });

  it("should include CASHIER_READ in SHIFT_MANAGER role permissions", async () => {
    const roles = await rbacService.getUserRoles(testShiftManagerUserId);
    const shiftManagerRole = roles.find((r) => r.role_code === "SHIFT_MANAGER");

    expect(shiftManagerRole).toBeDefined();
    expect(
      shiftManagerRole?.permissions,
      "SHIFT_MANAGER should have CASHIER_READ for viewing cashiers",
    ).toContain("CASHIER_READ");
  });

  it("should grant CASHIER_READ permission for own store", async () => {
    const hasPermission = await rbacService.checkPermission(
      testShiftManagerUserId,
      "CASHIER_READ" as any,
      { storeId: testShiftManagerStoreId },
    );

    expect(hasPermission).toBe(true);
  });

  it("should NOT include CASHIER_CREATE/UPDATE/DELETE in SHIFT_MANAGER permissions", async () => {
    const roles = await rbacService.getUserRoles(testShiftManagerUserId);
    const shiftManagerRole = roles.find((r) => r.role_code === "SHIFT_MANAGER");

    expect(shiftManagerRole?.permissions).not.toContain("CASHIER_CREATE");
    expect(shiftManagerRole?.permissions).not.toContain("CASHIER_UPDATE");
    expect(shiftManagerRole?.permissions).not.toContain("CASHIER_DELETE");
  });

  it("should include all required SHIFT_MANAGER permissions", async () => {
    const roles = await rbacService.getUserRoles(testShiftManagerUserId);
    const shiftManagerRole = roles.find((r) => r.role_code === "SHIFT_MANAGER");

    // SHIFT_MANAGER must have these permissions (matching rbac.seed.ts)
    const requiredPermissions = [
      "CLIENT_DASHBOARD_ACCESS",
      "CLIENT_EMPLOYEE_READ",
      "SHIFT_OPEN",
      "SHIFT_CLOSE",
      "SHIFT_READ",
      "SHIFT_RECONCILE",
      "TRANSACTION_CREATE",
      "TRANSACTION_READ",
      "INVENTORY_READ",
      "LOTTERY_PACK_RECEIVE",
      "LOTTERY_SHIFT_RECONCILE",
      "LOTTERY_REPORT",
      "REPORT_SHIFT",
      "REPORT_DAILY",
      "CASHIER_READ", // Added for Story 4.9
    ];

    for (const perm of requiredPermissions) {
      expect(
        shiftManagerRole?.permissions,
        `SHIFT_MANAGER should have ${perm} permission`,
      ).toContain(perm);
    }
  });
});

describe("RBACService - Missing company_id Regression Prevention", () => {
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
});
