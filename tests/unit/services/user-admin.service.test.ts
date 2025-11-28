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
 * Unit Tests: User Admin Service - CLIENT_OWNER Creation
 *
 * CRITICAL TEST COVERAGE:
 * - CLIENT_OWNER user creation with company
 * - Company linking to user_role (company_id must be set)
 * - Permission scope validation for CLIENT_OWNER
 *
 * These tests ensure the bugs we fixed don't regress:
 * 1. Company must show in users list for CLIENT_OWNER
 * 2. CLIENT_OWNER must have permissions after creation
 */

const prisma = new PrismaClient();
const userAdminService = new UserAdminService();

// Shared test data - initialized in global beforeAll
let testAdminUser: any;
let clientOwnerRoleId: string;
let superadminRoleId: string;
const createdUserIds: string[] = [];
const createdCompanyIds: string[] = [];

const auditContext: AuditContext = {
  userId: "",
  userEmail: "test-admin@test.com",
  userRoles: ["SUPERADMIN"],
  ipAddress: "127.0.0.1",
  userAgent: "vitest",
};

// Global setup before all tests
beforeAll(async () => {
  // Create a test admin user for audit context
  const hashedPassword = await bcrypt.hash("TestPassword123!", 10);
  testAdminUser = await prisma.user.create({
    data: {
      public_id: generatePublicId(PUBLIC_ID_PREFIXES.USER),
      email: `test-admin-${Date.now()}@test.com`,
      name: "Test Admin for Unit Tests",
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

  // Get SUPERADMIN role ID
  const superadminRole = await prisma.role.findUnique({
    where: { code: "SUPERADMIN" },
  });
  if (!superadminRole) {
    throw new Error("SUPERADMIN role not found - run RBAC seed first");
  }
  superadminRoleId = superadminRole.role_id;
});

// Global cleanup after all tests
afterAll(async () => {
  // Cleanup in reverse order of dependencies
  for (const userId of createdUserIds) {
    try {
      await prisma.userRole.deleteMany({ where: { user_id: userId } });
      await prisma.user.delete({ where: { user_id: userId } });
    } catch (e) {
      // User may already be deleted
    }
  }

  for (const companyId of createdCompanyIds) {
    try {
      await prisma.store.deleteMany({ where: { company_id: companyId } });
      await prisma.company.delete({ where: { company_id: companyId } });
    } catch (e) {
      // Company may already be deleted
    }
  }

  await prisma.$disconnect();
});

describe("UserAdminService - CLIENT_OWNER Creation with Company", () => {
  describe("Creating CLIENT_OWNER with new company", () => {
    it("should create CLIENT_OWNER user with company and link company_id to user_role", async () => {
      const uniqueEmail = `client-owner-${Date.now()}@test.com`;
      const companyName = `Test Company ${Date.now()}`;

      const input: CreateUserInput = {
        email: uniqueEmail,
        name: "Test Client Owner",
        password: "TestPassword123!",
        roles: [
          {
            role_id: clientOwnerRoleId,
            scope_type: "COMPANY",
          },
        ],
        companyName: companyName,
        companyAddress: "123 Test Street, Test City, TS 12345",
      };

      const result = await userAdminService.createUser(input, auditContext);

      // Track for cleanup
      createdUserIds.push(result.user_id);

      // Find the created company
      const createdCompany = await prisma.company.findFirst({
        where: { name: companyName },
      });
      expect(createdCompany).not.toBeNull();
      if (createdCompany) {
        createdCompanyIds.push(createdCompany.company_id);
      }

      // CRITICAL ASSERTION: Verify user was created
      expect(result.user_id).toBeDefined();
      expect(result.email).toBe(uniqueEmail.toLowerCase());
      expect(result.name).toBe("Test Client Owner");

      // CRITICAL ASSERTION: Verify user has roles
      expect(result.roles.length).toBeGreaterThan(0);

      // CRITICAL ASSERTION: Verify company_id is linked to user_role
      const clientOwnerRole = result.roles.find(
        (r) => r.role.code === "CLIENT_OWNER",
      );
      expect(clientOwnerRole).toBeDefined();
      expect(clientOwnerRole?.company_id).not.toBeNull();
      expect(clientOwnerRole?.company_id).toBe(createdCompany?.company_id);

      // CRITICAL ASSERTION: Verify company_name is populated
      expect(clientOwnerRole?.company_name).toBe(companyName);
    });

    it("should set company.owner_user_id to the created user", async () => {
      const uniqueEmail = `client-owner-ownership-${Date.now()}@test.com`;
      const companyName = `Ownership Test Company ${Date.now()}`;

      const input: CreateUserInput = {
        email: uniqueEmail,
        name: "Ownership Test Owner",
        password: "TestPassword123!",
        roles: [
          {
            role_id: clientOwnerRoleId,
            scope_type: "COMPANY",
          },
        ],
        companyName: companyName,
        companyAddress: "456 Ownership Ave",
      };

      const result = await userAdminService.createUser(input, auditContext);
      createdUserIds.push(result.user_id);

      // Find the created company
      const createdCompany = await prisma.company.findFirst({
        where: { name: companyName },
      });
      expect(createdCompany).not.toBeNull();
      if (createdCompany) {
        createdCompanyIds.push(createdCompany.company_id);
      }

      // CRITICAL ASSERTION: Company owner should be the created user
      expect(createdCompany?.owner_user_id).toBe(result.user_id);
    });

    it("should fail if CLIENT_OWNER is missing companyName", async () => {
      const uniqueEmail = `client-owner-missing-company-${Date.now()}@test.com`;

      const input: CreateUserInput = {
        email: uniqueEmail,
        name: "Missing Company Owner",
        password: "TestPassword123!",
        roles: [
          {
            role_id: clientOwnerRoleId,
            scope_type: "COMPANY",
          },
        ],
        // Missing companyName
        companyAddress: "123 Missing Company St",
      };

      await expect(
        userAdminService.createUser(input, auditContext),
      ).rejects.toThrow("Company name is required for Client Owner role");
    });

    it("should fail if CLIENT_OWNER is missing companyAddress", async () => {
      const uniqueEmail = `client-owner-missing-address-${Date.now()}@test.com`;

      const input: CreateUserInput = {
        email: uniqueEmail,
        name: "Missing Address Owner",
        password: "TestPassword123!",
        roles: [
          {
            role_id: clientOwnerRoleId,
            scope_type: "COMPANY",
          },
        ],
        companyName: "Missing Address Company",
        // Missing companyAddress
      };

      await expect(
        userAdminService.createUser(input, auditContext),
      ).rejects.toThrow("Company address is required for Client Owner role");
    });
  });

  describe("CLIENT_OWNER user_role company_id linking verification", () => {
    it("should have company_id in user_roles table for CLIENT_OWNER", async () => {
      const uniqueEmail = `client-owner-db-check-${Date.now()}@test.com`;
      const companyName = `DB Check Company ${Date.now()}`;

      const input: CreateUserInput = {
        email: uniqueEmail,
        name: "DB Check Client Owner",
        password: "TestPassword123!",
        roles: [
          {
            role_id: clientOwnerRoleId,
            scope_type: "COMPANY",
          },
        ],
        companyName: companyName,
        companyAddress: "789 DB Check Blvd",
      };

      const result = await userAdminService.createUser(input, auditContext);
      createdUserIds.push(result.user_id);

      // Get company
      const createdCompany = await prisma.company.findFirst({
        where: { name: companyName },
      });
      if (createdCompany) {
        createdCompanyIds.push(createdCompany.company_id);
      }

      // CRITICAL: Direct database check - this is what the permission middleware relies on
      const userRole = await prisma.userRole.findFirst({
        where: {
          user_id: result.user_id,
          role_id: clientOwnerRoleId,
        },
      });

      expect(userRole).not.toBeNull();
      expect(userRole?.company_id).not.toBeNull();
      expect(userRole?.company_id).toBe(createdCompany?.company_id);
    });

    it("should return company in getUsers list for CLIENT_OWNER", async () => {
      const uniqueEmail = `client-owner-list-${Date.now()}@test.com`;
      const companyName = `List Test Company ${Date.now()}`;

      const input: CreateUserInput = {
        email: uniqueEmail,
        name: "List Test Client Owner",
        password: "TestPassword123!",
        roles: [
          {
            role_id: clientOwnerRoleId,
            scope_type: "COMPANY",
          },
        ],
        companyName: companyName,
        companyAddress: "111 List Test Way",
      };

      const createdUser = await userAdminService.createUser(
        input,
        auditContext,
      );
      createdUserIds.push(createdUser.user_id);

      const createdCompany = await prisma.company.findFirst({
        where: { name: companyName },
      });
      if (createdCompany) {
        createdCompanyIds.push(createdCompany.company_id);
      }

      // Get users list and find our user
      const usersList = await userAdminService.getUsers({
        search: uniqueEmail,
      });

      const foundUser = usersList.data.find((u) => u.email === uniqueEmail);
      expect(foundUser).toBeDefined();

      // CRITICAL: Company should be visible in the list
      const clientOwnerRole = foundUser?.roles.find(
        (r) => r.role.code === "CLIENT_OWNER",
      );
      expect(clientOwnerRole?.company_id).toBe(createdCompany?.company_id);
      expect(clientOwnerRole?.company_name).toBe(companyName);
    });
  });

  describe("Non-CLIENT_OWNER role creation (regression check)", () => {
    it("should create SUPERADMIN user without company_id in user_role", async () => {
      const uniqueEmail = `superadmin-${Date.now()}@test.com`;

      const input: CreateUserInput = {
        email: uniqueEmail,
        name: "Test Superadmin",
        password: "TestPassword123!",
        roles: [
          {
            role_id: superadminRoleId,
            scope_type: "SYSTEM",
          },
        ],
      };

      const result = await userAdminService.createUser(input, auditContext);
      createdUserIds.push(result.user_id);

      // SUPERADMIN should NOT have company_id
      const superadminRole = result.roles.find(
        (r) => r.role.code === "SUPERADMIN",
      );
      expect(superadminRole).toBeDefined();
      expect(superadminRole?.company_id).toBeNull();
    });
  });
});

describe("UserAdminService - CLIENT_OWNER Permission Scope Verification", () => {
  let testClientOwnerUserId: string;
  let testCompanyId: string;

  beforeAll(async () => {
    // Create a CLIENT_OWNER user for permission testing
    const uniqueEmail = `perm-test-owner-${Date.now()}@test.com`;
    const companyName = `Permission Test Company ${Date.now()}`;

    const input: CreateUserInput = {
      email: uniqueEmail,
      name: "Permission Test Owner",
      password: "TestPassword123!",
      roles: [
        {
          role_id: clientOwnerRoleId,
          scope_type: "COMPANY",
        },
      ],
      companyName: companyName,
      companyAddress: "999 Permission Test Ave",
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
  });

  it("should have user_role with matching company_id for permission checks", async () => {
    // This is the critical check that enables permission middleware to work
    const userRole = await prisma.userRole.findFirst({
      where: {
        user_id: testClientOwnerUserId,
        role_id: clientOwnerRoleId,
      },
      include: {
        role: true,
      },
    });

    expect(userRole).not.toBeNull();
    expect(userRole?.role.scope).toBe("COMPANY");
    expect(userRole?.company_id).toBe(testCompanyId);
  });

  it("should have CLIENT_EMPLOYEE_READ permission via CLIENT_OWNER role", async () => {
    // Verify the role has the required permission
    const rolePermissions = await prisma.rolePermission.findMany({
      where: { role_id: clientOwnerRoleId },
      include: { permission: true },
    });

    const hasClientEmployeeRead = rolePermissions.some(
      (rp) => rp.permission.code === "CLIENT_EMPLOYEE_READ",
    );

    expect(hasClientEmployeeRead).toBe(true);
  });

  it("should have all required CLIENT permissions via CLIENT_OWNER role", async () => {
    const requiredPermissions = [
      "CLIENT_DASHBOARD_ACCESS",
      "CLIENT_EMPLOYEE_CREATE",
      "CLIENT_EMPLOYEE_READ",
      "CLIENT_EMPLOYEE_DELETE",
    ];

    const rolePermissions = await prisma.rolePermission.findMany({
      where: { role_id: clientOwnerRoleId },
      include: { permission: true },
    });

    const permissionCodes = rolePermissions.map((rp) => rp.permission.code);

    for (const requiredPerm of requiredPermissions) {
      expect(permissionCodes).toContain(requiredPerm);
    }
  });
});
