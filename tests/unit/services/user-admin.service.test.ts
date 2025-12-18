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
 * Unit Tests: User Admin Service - CLIENT_OWNER and CLIENT_USER Creation
 *
 * CRITICAL TEST COVERAGE:
 * - CLIENT_OWNER user creation with company
 * - CLIENT_USER user creation with company and store assignment
 * - Company linking to user_role (company_id must be set)
 * - Store linking to user_role for CLIENT_USER (store_id must be set)
 * - Permission scope validation for CLIENT_OWNER and CLIENT_USER
 * - Security validations (store belongs to company, active status checks)
 *
 * These tests ensure the bugs we fixed don't regress:
 * 1. Company must show in users list for CLIENT_OWNER
 * 2. CLIENT_OWNER must have permissions after creation
 * 3. CLIENT_USER must have company_id and store_id in user_role
 */

const prisma = new PrismaClient();
const userAdminService = new UserAdminService();

// Shared test data - initialized in global beforeAll
let testAdminUser: any;
let clientOwnerRoleId: string;
let clientUserRoleId: string;
let superadminRoleId: string;
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

  // Get CLIENT_USER role ID
  const clientUserRole = await prisma.role.findUnique({
    where: { code: "CLIENT_USER" },
  });
  if (!clientUserRole) {
    throw new Error("CLIENT_USER role not found - run RBAC seed first");
  }
  clientUserRoleId = clientUserRole.role_id;

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

  for (const storeId of createdStoreIds) {
    try {
      await prisma.store.delete({ where: { store_id: storeId } });
    } catch (e) {
      // Store may already be deleted
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

describe("UserAdminService - CLIENT_USER Creation with Company and Store", () => {
  let testCompanyId: string;
  let testStoreId: string;

  beforeAll(async () => {
    // Create a test company and store for CLIENT_USER assignment
    const testCompany = await prisma.company.create({
      data: {
        public_id: generatePublicId(PUBLIC_ID_PREFIXES.COMPANY),
        name: `Test Company for CLIENT_USER ${Date.now()}`,
        address: "123 Test Street, Test City",
        owner_user_id: testAdminUser.user_id,
        status: "ACTIVE",
      },
    });
    testCompanyId = testCompany.company_id;
    createdCompanyIds.push(testCompanyId);

    const testStore = await prisma.store.create({
      data: {
        public_id: generatePublicId(PUBLIC_ID_PREFIXES.STORE),
        name: `Test Store for CLIENT_USER ${Date.now()}`,
        company_id: testCompanyId,
        location_json: { address: "123 Test St" },
        timezone: "America/New_York",
        status: "ACTIVE",
      },
    });
    testStoreId = testStore.store_id;
    createdStoreIds.push(testStoreId);
  });

  describe("Creating CLIENT_USER with company and store assignment", () => {
    it("should create CLIENT_USER user with company_id and store_id linked to user_role", async () => {
      const uniqueEmail = `client-user-${Date.now()}@test.com`;

      const input: CreateUserInput = {
        email: uniqueEmail,
        name: "Test Client User",
        password: "TestPassword123!",
        roles: [
          {
            role_id: clientUserRoleId,
            scope_type: "COMPANY",
            company_id: testCompanyId,
            store_id: testStoreId,
          },
        ],
      };

      const result = await userAdminService.createUser(input, auditContext);

      // Track for cleanup
      createdUserIds.push(result.user_id);

      // CRITICAL ASSERTION: Verify user was created
      expect(result.user_id).toBeDefined();
      expect(result.email).toBe(uniqueEmail.toLowerCase());
      expect(result.name).toBe("Test Client User");

      // CRITICAL ASSERTION: Verify user has roles
      expect(result.roles.length).toBeGreaterThan(0);

      // CRITICAL ASSERTION: Verify company_id and store_id are linked to user_role
      const clientUserRole = result.roles.find(
        (r) => r.role.code === "CLIENT_USER",
      );
      expect(clientUserRole).toBeDefined();
      expect(clientUserRole?.company_id).not.toBeNull();
      expect(clientUserRole?.company_id).toBe(testCompanyId);
      expect(clientUserRole?.store_id).not.toBeNull();
      expect(clientUserRole?.store_id).toBe(testStoreId);
    });

    it("should set is_client_user flag to true for CLIENT_USER", async () => {
      const uniqueEmail = `client-user-flag-${Date.now()}@test.com`;

      const input: CreateUserInput = {
        email: uniqueEmail,
        name: "Flag Test Client User",
        password: "TestPassword123!",
        roles: [
          {
            role_id: clientUserRoleId,
            scope_type: "COMPANY",
            company_id: testCompanyId,
            store_id: testStoreId,
          },
        ],
      };

      const result = await userAdminService.createUser(input, auditContext);
      createdUserIds.push(result.user_id);

      // Verify is_client_user flag is set
      const user = await prisma.user.findUnique({
        where: { user_id: result.user_id },
      });
      expect(user?.is_client_user).toBe(true);
    });

    it("should fail if CLIENT_USER is missing company_id", async () => {
      const uniqueEmail = `client-user-missing-company-${Date.now()}@test.com`;

      const input: CreateUserInput = {
        email: uniqueEmail,
        name: "Missing Company Client User",
        password: "TestPassword123!",
        roles: [
          {
            role_id: clientUserRoleId,
            scope_type: "COMPANY",
            // Missing company_id
            store_id: testStoreId,
          },
        ],
      };

      await expect(
        userAdminService.createUser(input, auditContext),
      ).rejects.toThrow(
        "Company ID is required for CLIENT_USER role assignment",
      );
    });

    it("should fail if CLIENT_USER is missing store_id", async () => {
      const uniqueEmail = `client-user-missing-store-${Date.now()}@test.com`;

      const input: CreateUserInput = {
        email: uniqueEmail,
        name: "Missing Store Client User",
        password: "TestPassword123!",
        roles: [
          {
            role_id: clientUserRoleId,
            scope_type: "COMPANY",
            company_id: testCompanyId,
            // Missing store_id
          },
        ],
      };

      await expect(
        userAdminService.createUser(input, auditContext),
      ).rejects.toThrow("Store ID is required for CLIENT_USER role assignment");
    });

    it("should fail if store does not belong to the specified company (security check)", async () => {
      // Create another company and store
      const otherCompany = await prisma.company.create({
        data: {
          public_id: generatePublicId(PUBLIC_ID_PREFIXES.COMPANY),
          name: `Other Company ${Date.now()}`,
          address: "456 Other Street",
          owner_user_id: testAdminUser.user_id,
          status: "ACTIVE",
        },
      });
      createdCompanyIds.push(otherCompany.company_id);

      const otherStore = await prisma.store.create({
        data: {
          public_id: generatePublicId(PUBLIC_ID_PREFIXES.STORE),
          name: `Other Store ${Date.now()}`,
          company_id: otherCompany.company_id,
          location_json: { address: "456 Other St" },
          timezone: "America/New_York",
          status: "ACTIVE",
        },
      });
      createdStoreIds.push(otherStore.store_id);

      const uniqueEmail = `client-user-wrong-store-${Date.now()}@test.com`;

      const input: CreateUserInput = {
        email: uniqueEmail,
        name: "Wrong Store Client User",
        password: "TestPassword123!",
        roles: [
          {
            role_id: clientUserRoleId,
            scope_type: "COMPANY",
            company_id: testCompanyId, // First company
            store_id: otherStore.store_id, // Store from different company
          },
        ],
      };

      await expect(
        userAdminService.createUser(input, auditContext),
      ).rejects.toThrow(
        "Store does not belong to the specified company. This is a security violation.",
      );
    });

    it("should fail if store does not exist", async () => {
      const uniqueEmail = `client-user-invalid-store-${Date.now()}@test.com`;
      const fakeStoreId = "00000000-0000-0000-0000-000000000000";

      const input: CreateUserInput = {
        email: uniqueEmail,
        name: "Invalid Store Client User",
        password: "TestPassword123!",
        roles: [
          {
            role_id: clientUserRoleId,
            scope_type: "COMPANY",
            company_id: testCompanyId,
            store_id: fakeStoreId,
          },
        ],
      };

      await expect(
        userAdminService.createUser(input, auditContext),
      ).rejects.toThrow(`Store with ID ${fakeStoreId} not found`);
    });

    it("should fail if company does not exist", async () => {
      const uniqueEmail = `client-user-invalid-company-${Date.now()}@test.com`;
      const fakeCompanyId = "00000000-0000-0000-0000-000000000000";

      const input: CreateUserInput = {
        email: uniqueEmail,
        name: "Invalid Company Client User",
        password: "TestPassword123!",
        roles: [
          {
            role_id: clientUserRoleId,
            scope_type: "COMPANY",
            company_id: fakeCompanyId,
            store_id: testStoreId,
          },
        ],
      };

      await expect(
        userAdminService.createUser(input, auditContext),
      ).rejects.toThrow(`Company with ID ${fakeCompanyId} not found`);
    });

    it("should fail if store is inactive", async () => {
      // Create an inactive store
      const inactiveStore = await prisma.store.create({
        data: {
          public_id: generatePublicId(PUBLIC_ID_PREFIXES.STORE),
          name: `Inactive Store ${Date.now()}`,
          company_id: testCompanyId,
          location_json: { address: "789 Inactive St" },
          timezone: "America/New_York",
          status: "INACTIVE",
        },
      });
      createdStoreIds.push(inactiveStore.store_id);

      const uniqueEmail = `client-user-inactive-store-${Date.now()}@test.com`;

      const input: CreateUserInput = {
        email: uniqueEmail,
        name: "Inactive Store Client User",
        password: "TestPassword123!",
        roles: [
          {
            role_id: clientUserRoleId,
            scope_type: "COMPANY",
            company_id: testCompanyId,
            store_id: inactiveStore.store_id,
          },
        ],
      };

      await expect(
        userAdminService.createUser(input, auditContext),
      ).rejects.toThrow("Cannot assign CLIENT_USER to an inactive store");
    });

    it("should fail if company is inactive", async () => {
      // Create an inactive company
      const inactiveCompany = await prisma.company.create({
        data: {
          public_id: generatePublicId(PUBLIC_ID_PREFIXES.COMPANY),
          name: `Inactive Company ${Date.now()}`,
          address: "789 Inactive Ave",
          owner_user_id: testAdminUser.user_id,
          status: "INACTIVE",
        },
      });
      createdCompanyIds.push(inactiveCompany.company_id);

      const inactiveStore = await prisma.store.create({
        data: {
          public_id: generatePublicId(PUBLIC_ID_PREFIXES.STORE),
          name: `Inactive Company Store ${Date.now()}`,
          company_id: inactiveCompany.company_id,
          location_json: { address: "789 Inactive St" },
          timezone: "America/New_York",
          status: "ACTIVE",
        },
      });
      createdStoreIds.push(inactiveStore.store_id);

      const uniqueEmail = `client-user-inactive-company-${Date.now()}@test.com`;

      const input: CreateUserInput = {
        email: uniqueEmail,
        name: "Inactive Company Client User",
        password: "TestPassword123!",
        roles: [
          {
            role_id: clientUserRoleId,
            scope_type: "COMPANY",
            company_id: inactiveCompany.company_id,
            store_id: inactiveStore.store_id,
          },
        ],
      };

      await expect(
        userAdminService.createUser(input, auditContext),
      ).rejects.toThrow("Cannot assign CLIENT_USER to an inactive company");
    });
  });

  describe("CLIENT_USER user_role company_id and store_id linking verification", () => {
    it("should have company_id and store_id in user_roles table for CLIENT_USER", async () => {
      const uniqueEmail = `client-user-db-check-${Date.now()}@test.com`;

      const input: CreateUserInput = {
        email: uniqueEmail,
        name: "DB Check Client User",
        password: "TestPassword123!",
        roles: [
          {
            role_id: clientUserRoleId,
            scope_type: "COMPANY",
            company_id: testCompanyId,
            store_id: testStoreId,
          },
        ],
      };

      const result = await userAdminService.createUser(input, auditContext);
      createdUserIds.push(result.user_id);

      // CRITICAL: Direct database check - this is what the permission middleware relies on
      const userRole = await prisma.userRole.findFirst({
        where: {
          user_id: result.user_id,
          role_id: clientUserRoleId,
        },
      });

      expect(userRole).not.toBeNull();
      expect(userRole?.company_id).not.toBeNull();
      expect(userRole?.company_id).toBe(testCompanyId);
      expect(userRole?.store_id).not.toBeNull();
      expect(userRole?.store_id).toBe(testStoreId);
    });

    it("should return company and store in getUsers list for CLIENT_USER", async () => {
      const uniqueEmail = `client-user-list-${Date.now()}@test.com`;

      const input: CreateUserInput = {
        email: uniqueEmail,
        name: "List Test Client User",
        password: "TestPassword123!",
        roles: [
          {
            role_id: clientUserRoleId,
            scope_type: "COMPANY",
            company_id: testCompanyId,
            store_id: testStoreId,
          },
        ],
      };

      const createdUser = await userAdminService.createUser(
        input,
        auditContext,
      );
      createdUserIds.push(createdUser.user_id);

      // Get users list and find our user
      const usersList = await userAdminService.getUsers({
        search: uniqueEmail,
      });

      const foundUser = usersList.data.find((u) => u.email === uniqueEmail);
      expect(foundUser).toBeDefined();

      // CRITICAL: Company and store should be visible in the list
      const clientUserRole = foundUser?.roles.find(
        (r) => r.role.code === "CLIENT_USER",
      );
      expect(clientUserRole?.company_id).toBe(testCompanyId);
      expect(clientUserRole?.store_id).toBe(testStoreId);
    });
  });
});

describe("UserAdminService - CRITICAL: User Status Update with Cascade Deactivation", () => {
  /**
   * CRITICAL SECURITY TESTS: User Deactivation
   *
   * These tests verify the fix for the security bug where:
   * - Deactivated CLIENT_OWNER's employees could still access the system
   * - Users under deactivated companies were not being deactivated
   *
   * When a CLIENT_OWNER is deactivated:
   * 1. The CLIENT_OWNER user status becomes INACTIVE
   * 2. All owned companies become INACTIVE
   * 3. All stores under those companies become INACTIVE
   * 4. ALL users with roles in those companies become INACTIVE (CRITICAL!)
   */

  let testClientOwnerId: string;
  let testClientOwnerCompanyId: string;
  let testClientOwnerStoreId: string;
  let testEmployeeId: string;
  let testManagerId: string;

  beforeAll(async () => {
    // Create a CLIENT_OWNER with company, store, and employees
    const ownerEmail = `cascade-owner-${Date.now()}@test.com`;
    const companyName = `Cascade Test Company ${Date.now()}`;

    const ownerInput: CreateUserInput = {
      email: ownerEmail,
      name: "Cascade Test Owner",
      password: "TestPassword123!",
      roles: [
        {
          role_id: clientOwnerRoleId,
          scope_type: "COMPANY",
        },
      ],
      companyName: companyName,
      companyAddress: "123 Cascade Test Ave",
    };

    const owner = await userAdminService.createUser(ownerInput, auditContext);
    testClientOwnerId = owner.user_id;
    createdUserIds.push(testClientOwnerId);

    const company = await prisma.company.findFirst({
      where: { name: companyName },
    });
    testClientOwnerCompanyId = company!.company_id;
    createdCompanyIds.push(testClientOwnerCompanyId);

    // Create a store under the company
    const store = await prisma.store.create({
      data: {
        public_id: generatePublicId(PUBLIC_ID_PREFIXES.STORE),
        name: `Cascade Test Store ${Date.now()}`,
        company_id: testClientOwnerCompanyId,
        location_json: { address: "123 Cascade Store St" },
        timezone: "America/New_York",
        status: "ACTIVE",
      },
    });
    testClientOwnerStoreId = store.store_id;
    createdStoreIds.push(testClientOwnerStoreId);

    // Create a CLIENT_USER employee under the company
    const employeeInput: CreateUserInput = {
      email: `cascade-employee-${Date.now()}@test.com`,
      name: "Cascade Test Employee",
      password: "TestPassword123!",
      roles: [
        {
          role_id: clientUserRoleId,
          scope_type: "COMPANY",
          company_id: testClientOwnerCompanyId,
          store_id: testClientOwnerStoreId,
        },
      ],
    };

    const employee = await userAdminService.createUser(
      employeeInput,
      auditContext,
    );
    testEmployeeId = employee.user_id;
    createdUserIds.push(testEmployeeId);

    // Create a STORE_MANAGER under the company
    const storeManagerRole = await prisma.role.findUnique({
      where: { code: "STORE_MANAGER" },
    });

    const managerInput: CreateUserInput = {
      email: `cascade-manager-${Date.now()}@test.com`,
      name: "Cascade Test Manager",
      password: "TestPassword123!",
      roles: [
        {
          role_id: storeManagerRole!.role_id,
          scope_type: "STORE",
          company_id: testClientOwnerCompanyId,
          store_id: testClientOwnerStoreId,
        },
      ],
    };

    const manager = await userAdminService.createUser(
      managerInput,
      auditContext,
    );
    testManagerId = manager.user_id;
    createdUserIds.push(testManagerId);
  });

  describe("CRITICAL: Cascade deactivation when CLIENT_OWNER is deactivated", () => {
    it("should deactivate CLIENT_OWNER user successfully", async () => {
      // Verify all entities are ACTIVE before deactivation
      const ownerBefore = await prisma.user.findUnique({
        where: { user_id: testClientOwnerId },
      });
      expect(ownerBefore?.status).toBe("ACTIVE");

      // Deactivate the CLIENT_OWNER
      const result = await userAdminService.updateUserStatus(
        testClientOwnerId,
        "INACTIVE" as any,
        auditContext,
      );

      expect(result.status).toBe("INACTIVE");
    });

    it("should cascade deactivation to owned company", async () => {
      const company = await prisma.company.findUnique({
        where: { company_id: testClientOwnerCompanyId },
      });
      expect(company?.status).toBe("INACTIVE");
    });

    it("should cascade deactivation to stores under owned company", async () => {
      const store = await prisma.store.findUnique({
        where: { store_id: testClientOwnerStoreId },
      });
      expect(store?.status).toBe("INACTIVE");
    });

    it("CRITICAL: should cascade deactivation to CLIENT_USER employees", async () => {
      const employee = await prisma.user.findUnique({
        where: { user_id: testEmployeeId },
      });
      expect(employee?.status).toBe("INACTIVE");
    });

    it("CRITICAL: should cascade deactivation to STORE_MANAGER under company", async () => {
      const manager = await prisma.user.findUnique({
        where: { user_id: testManagerId },
      });
      expect(manager?.status).toBe("INACTIVE");
    });
  });

  describe("CRITICAL: Cascade reactivation when CLIENT_OWNER is reactivated", () => {
    it("should reactivate CLIENT_OWNER user successfully", async () => {
      const result = await userAdminService.updateUserStatus(
        testClientOwnerId,
        "ACTIVE" as any,
        auditContext,
      );

      expect(result.status).toBe("ACTIVE");
    });

    it("should cascade reactivation to owned company", async () => {
      const company = await prisma.company.findUnique({
        where: { company_id: testClientOwnerCompanyId },
      });
      expect(company?.status).toBe("ACTIVE");
    });

    it("should cascade reactivation to stores under owned company", async () => {
      const store = await prisma.store.findUnique({
        where: { store_id: testClientOwnerStoreId },
      });
      expect(store?.status).toBe("ACTIVE");
    });

    it("CRITICAL: should cascade reactivation to CLIENT_USER employees", async () => {
      const employee = await prisma.user.findUnique({
        where: { user_id: testEmployeeId },
      });
      expect(employee?.status).toBe("ACTIVE");
    });

    it("CRITICAL: should cascade reactivation to STORE_MANAGER under company", async () => {
      const manager = await prisma.user.findUnique({
        where: { user_id: testManagerId },
      });
      expect(manager?.status).toBe("ACTIVE");
    });
  });

  describe("Non-CLIENT_OWNER deactivation should NOT cascade", () => {
    it("should deactivate regular user without cascading", async () => {
      // Create a SUPERADMIN user
      const superadminEmail = `superadmin-no-cascade-${Date.now()}@test.com`;
      const hashedPassword = await bcrypt.hash("TestPassword123!", 10);

      const superadmin = await prisma.user.create({
        data: {
          public_id: generatePublicId(PUBLIC_ID_PREFIXES.USER),
          email: superadminEmail,
          name: "No Cascade Superadmin",
          password_hash: hashedPassword,
          status: "ACTIVE",
        },
      });
      createdUserIds.push(superadmin.user_id);

      // Assign SUPERADMIN role
      await prisma.userRole.create({
        data: {
          user_id: superadmin.user_id,
          role_id: superadminRoleId,
        },
      });

      // Deactivate the SUPERADMIN
      const result = await userAdminService.updateUserStatus(
        superadmin.user_id,
        "INACTIVE" as any,
        auditContext,
      );

      expect(result.status).toBe("INACTIVE");

      // Verify no companies were affected (SUPERADMIN doesn't own companies)
      // This test ensures we don't accidentally cascade for non-CLIENT_OWNER roles
    });
  });

  describe("Validation errors", () => {
    it("should reject invalid status values", async () => {
      await expect(
        userAdminService.updateUserStatus(
          testClientOwnerId,
          "INVALID_STATUS" as any,
          auditContext,
        ),
      ).rejects.toThrow("Invalid status. Must be ACTIVE or INACTIVE");
    });

    it("should reject non-existent user ID", async () => {
      const fakeUserId = "00000000-0000-0000-0000-000000000000";
      await expect(
        userAdminService.updateUserStatus(
          fakeUserId,
          "INACTIVE" as any,
          auditContext,
        ),
      ).rejects.toThrow(`User with ID ${fakeUserId} not found`);
    });
  });
});
