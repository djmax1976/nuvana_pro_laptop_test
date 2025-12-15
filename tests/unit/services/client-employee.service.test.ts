import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  ClientEmployeeService,
  type AuditContext,
} from "../../../backend/src/services/client-employee.service";
import {
  generatePublicId,
  PUBLIC_ID_PREFIXES,
} from "../../../backend/src/utils/public-id";
import bcrypt from "bcrypt";

/**
 * Unit Tests: Client Employee Service
 *
 * CRITICAL TEST COVERAGE:
 * - Employee creation sets is_client_user = true for client dashboard access
 * - Email validation and duplicate prevention
 * - Store ownership verification
 * - Role scope validation (only STORE scope roles allowed)
 * - Employee deletion authorization
 * - Role assignment with proper company/store linkage
 *
 * Story: 2.91 - Client Employee Management
 *
 * These tests ensure CLIENT_OWNER can create employees who can access
 * the client dashboard after login (is_client_user = true).
 */

const prisma = new PrismaClient();
const clientEmployeeService = new ClientEmployeeService();

// Shared test data
let testClientOwnerUser: any;
let testCompany: any;
let testStore: any;
let testStoreRole: any;

const createdUserIds: string[] = [];
const createdCompanyIds: string[] = [];
const createdStoreIds: string[] = [];

const mockAuditContext: AuditContext = {
  userId: "",
  userEmail: "test-client-owner@test.com",
  userRoles: ["CLIENT_OWNER"],
  ipAddress: "127.0.0.1",
  userAgent: "vitest",
};

// Global setup
beforeAll(async () => {
  // Create a test CLIENT_OWNER user
  const hashedPassword = await bcrypt.hash("TestPassword123!", 10);
  testClientOwnerUser = await prisma.user.create({
    data: {
      public_id: generatePublicId(PUBLIC_ID_PREFIXES.USER),
      email: `client-emp-test-owner-${Date.now()}@test.com`,
      name: "Client Employee Test Owner",
      password_hash: hashedPassword,
      status: "ACTIVE",
      is_client_user: true,
    },
  });
  createdUserIds.push(testClientOwnerUser.user_id);
  mockAuditContext.userId = testClientOwnerUser.user_id;

  // Create a test company owned by the client
  testCompany = await prisma.company.create({
    data: {
      public_id: generatePublicId(PUBLIC_ID_PREFIXES.COMPANY),
      name: `Client Employee Test Company ${Date.now()}`,
      address: "123 Test Street",
      status: "ACTIVE",
      owner_user_id: testClientOwnerUser.user_id,
    },
  });
  createdCompanyIds.push(testCompany.company_id);

  // Create a test store under the company
  testStore = await prisma.store.create({
    data: {
      public_id: generatePublicId(PUBLIC_ID_PREFIXES.STORE),
      name: `Test Store ${Date.now()}`,
      company_id: testCompany.company_id,
      status: "ACTIVE",
    },
  });
  createdStoreIds.push(testStore.store_id);

  // Get a STORE scope role for employee assignment
  testStoreRole = await prisma.role.findFirst({
    where: { scope: "STORE" },
  });

  if (!testStoreRole) {
    throw new Error("No STORE scope role found - run RBAC seed first");
  }
});

// Global cleanup
afterAll(async () => {
  // Cleanup users (includes employees)
  for (const userId of createdUserIds) {
    try {
      await prisma.userRole.deleteMany({ where: { user_id: userId } });
      await prisma.user.delete({ where: { user_id: userId } });
    } catch (e) {
      // Ignore cleanup errors
    }
  }

  // Cleanup stores
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
      // Ignore cleanup errors
    }
  }

  await prisma.$disconnect();
});

describe("2.91-UNIT: Client Employee Service - Employee Creation", () => {
  describe("is_client_user Flag - Login Redirection", () => {
    it("[P0] 2.91-UNIT-001: should create employee with is_client_user = true", async () => {
      // GIVEN: Valid employee data
      const employeeData = {
        email: `employee-icu-test-${Date.now()}@test.com`,
        name: "Test Employee",
        store_id: testStore.store_id,
        role_id: testStoreRole.role_id,
        password: "TestPassword123!",
      };

      // WHEN: Creating employee via client employee service
      const result = await clientEmployeeService.createEmployee(
        employeeData,
        testClientOwnerUser.user_id,
        mockAuditContext,
      );
      createdUserIds.push(result.user_id);

      // THEN: Employee should be created
      expect(result.user_id).toBeDefined();
      expect(result.email).toBe(employeeData.email.toLowerCase());

      // AND: is_client_user should be TRUE in database
      const dbUser = await prisma.user.findUnique({
        where: { user_id: result.user_id },
      });
      expect(dbUser).not.toBeNull();
      expect(dbUser?.is_client_user).toBe(true);
    });

    it("[P0] 2.91-UNIT-002: should ensure employee can access client dashboard after login", async () => {
      // GIVEN: Employee created via client employee service
      const employeeData = {
        email: `employee-dashboard-${Date.now()}@test.com`,
        name: "Dashboard Access Employee",
        store_id: testStore.store_id,
        role_id: testStoreRole.role_id,
        password: "SecurePass123!",
      };

      const result = await clientEmployeeService.createEmployee(
        employeeData,
        testClientOwnerUser.user_id,
        mockAuditContext,
      );
      createdUserIds.push(result.user_id);

      // WHEN: Checking user's is_client_user flag
      const user = await prisma.user.findUnique({
        where: { user_id: result.user_id },
        select: {
          is_client_user: true,
          email: true,
          status: true,
        },
      });

      // THEN: is_client_user should be true (for client dashboard redirection)
      expect(user?.is_client_user).toBe(true);
      // AND: User should be active
      expect(user?.status).toBe("ACTIVE");
    });

    it("[P0] 2.91-UNIT-003: should create employee with hashed password", async () => {
      // GIVEN: Employee data with password
      const plainPassword = "MySecurePassword123!";
      const employeeData = {
        email: `employee-pwd-test-${Date.now()}@test.com`,
        name: "Password Test Employee",
        store_id: testStore.store_id,
        role_id: testStoreRole.role_id,
        password: plainPassword,
      };

      // WHEN: Creating employee
      const result = await clientEmployeeService.createEmployee(
        employeeData,
        testClientOwnerUser.user_id,
        mockAuditContext,
      );
      createdUserIds.push(result.user_id);

      // THEN: Password should be hashed in database
      const dbUser = await prisma.user.findUnique({
        where: { user_id: result.user_id },
      });
      expect(dbUser?.password_hash).not.toBeNull();
      expect(dbUser?.password_hash).not.toBe(plainPassword);

      // AND: Password should be verifiable with bcrypt
      const isValidPassword = await bcrypt.compare(
        plainPassword,
        dbUser!.password_hash!,
      );
      expect(isValidPassword).toBe(true);
    });

    it("[P1] 2.91-UNIT-004: should generate random password when not provided", async () => {
      // GIVEN: Employee data WITHOUT password
      const employeeData = {
        email: `employee-no-pwd-${Date.now()}@test.com`,
        name: "No Password Employee",
        store_id: testStore.store_id,
        role_id: testStoreRole.role_id,
        // No password provided
      };

      // WHEN: Creating employee
      const result = await clientEmployeeService.createEmployee(
        employeeData,
        testClientOwnerUser.user_id,
        mockAuditContext,
      );
      createdUserIds.push(result.user_id);

      // THEN: A password hash should still be set (auto-generated)
      const dbUser = await prisma.user.findUnique({
        where: { user_id: result.user_id },
      });
      expect(dbUser?.password_hash).not.toBeNull();
      expect(dbUser?.password_hash!.length).toBeGreaterThan(0);
    });
  });

  describe("Role Assignment - Store Scope", () => {
    it("[P0] 2.91-UNIT-010: should assign STORE scope role with store_id and company_id", async () => {
      // GIVEN: Valid employee data
      const employeeData = {
        email: `employee-role-${Date.now()}@test.com`,
        name: "Role Assignment Employee",
        store_id: testStore.store_id,
        role_id: testStoreRole.role_id,
        password: "TestPassword123!",
      };

      // WHEN: Creating employee
      const result = await clientEmployeeService.createEmployee(
        employeeData,
        testClientOwnerUser.user_id,
        mockAuditContext,
      );
      createdUserIds.push(result.user_id);

      // THEN: User role should be created with proper linkage
      const userRole = await prisma.userRole.findFirst({
        where: { user_id: result.user_id },
        include: { role: true },
      });

      expect(userRole).not.toBeNull();
      expect(userRole?.role_id).toBe(testStoreRole.role_id);
      expect(userRole?.store_id).toBe(testStore.store_id);
      expect(userRole?.company_id).toBe(testCompany.company_id);
      expect(userRole?.role.scope).toBe("STORE");
    });

    it("[P0] 2.91-UNIT-011: should reject non-STORE scope roles", async () => {
      // GIVEN: A SYSTEM scope role
      const systemRole = await prisma.role.findFirst({
        where: { scope: "SYSTEM" },
      });

      if (!systemRole) {
        console.log("No SYSTEM role found, skipping test");
        return;
      }

      const employeeData = {
        email: `employee-system-role-${Date.now()}@test.com`,
        name: "System Role Employee",
        store_id: testStore.store_id,
        role_id: systemRole.role_id,
        password: "TestPassword123!",
      };

      // WHEN/THEN: Creating employee with SYSTEM role should fail
      await expect(
        clientEmployeeService.createEmployee(
          employeeData,
          testClientOwnerUser.user_id,
          mockAuditContext,
        ),
      ).rejects.toThrow(/STORE scope roles/);
    });

    it("[P0] 2.91-UNIT-012: should reject COMPANY scope roles", async () => {
      // GIVEN: A COMPANY scope role
      const companyRole = await prisma.role.findFirst({
        where: { scope: "COMPANY" },
      });

      if (!companyRole) {
        console.log("No COMPANY role found, skipping test");
        return;
      }

      const employeeData = {
        email: `employee-company-role-${Date.now()}@test.com`,
        name: "Company Role Employee",
        store_id: testStore.store_id,
        role_id: companyRole.role_id,
        password: "TestPassword123!",
      };

      // WHEN/THEN: Creating employee with COMPANY role should fail
      await expect(
        clientEmployeeService.createEmployee(
          employeeData,
          testClientOwnerUser.user_id,
          mockAuditContext,
        ),
      ).rejects.toThrow(/STORE scope roles/);
    });
  });

  describe("Input Validation", () => {
    it("[P0] 2.91-UNIT-020: should reject invalid email format", async () => {
      // GIVEN: Invalid email
      const employeeData = {
        email: "not-a-valid-email",
        name: "Invalid Email Employee",
        store_id: testStore.store_id,
        role_id: testStoreRole.role_id,
        password: "TestPassword123!",
      };

      // WHEN/THEN: Should throw validation error
      await expect(
        clientEmployeeService.createEmployee(
          employeeData,
          testClientOwnerUser.user_id,
          mockAuditContext,
        ),
      ).rejects.toThrow(/Invalid email format/);
    });

    it("[P0] 2.91-UNIT-021: should reject empty name", async () => {
      // GIVEN: Empty name
      const employeeData = {
        email: `employee-empty-name-${Date.now()}@test.com`,
        name: "",
        store_id: testStore.store_id,
        role_id: testStoreRole.role_id,
        password: "TestPassword123!",
      };

      // WHEN/THEN: Should throw validation error
      await expect(
        clientEmployeeService.createEmployee(
          employeeData,
          testClientOwnerUser.user_id,
          mockAuditContext,
        ),
      ).rejects.toThrow(/Name is required/);
    });

    it("[P0] 2.91-UNIT-022: should reject whitespace-only name", async () => {
      // GIVEN: Whitespace-only name
      const employeeData = {
        email: `employee-ws-name-${Date.now()}@test.com`,
        name: "   ",
        store_id: testStore.store_id,
        role_id: testStoreRole.role_id,
        password: "TestPassword123!",
      };

      // WHEN/THEN: Should throw validation error
      await expect(
        clientEmployeeService.createEmployee(
          employeeData,
          testClientOwnerUser.user_id,
          mockAuditContext,
        ),
      ).rejects.toThrow(/Name is required/);
    });

    it("[P0] 2.91-UNIT-023: should reject duplicate email", async () => {
      // GIVEN: Create first employee
      const email = `employee-dup-${Date.now()}@test.com`;
      const firstEmployee = await clientEmployeeService.createEmployee(
        {
          email,
          name: "First Employee",
          store_id: testStore.store_id,
          role_id: testStoreRole.role_id,
          password: "TestPassword123!",
        },
        testClientOwnerUser.user_id,
        mockAuditContext,
      );
      createdUserIds.push(firstEmployee.user_id);

      // WHEN/THEN: Creating second employee with same email should fail
      await expect(
        clientEmployeeService.createEmployee(
          {
            email,
            name: "Second Employee",
            store_id: testStore.store_id,
            role_id: testStoreRole.role_id,
            password: "TestPassword123!",
          },
          testClientOwnerUser.user_id,
          mockAuditContext,
        ),
      ).rejects.toThrow(/already exists/);
    });

    it("[P1] 2.91-UNIT-024: should normalize email to lowercase", async () => {
      // GIVEN: Email with mixed case
      const employeeData = {
        email: `UPPERCASE-${Date.now()}@TEST.COM`,
        name: "Uppercase Email Employee",
        store_id: testStore.store_id,
        role_id: testStoreRole.role_id,
        password: "TestPassword123!",
      };

      // WHEN: Creating employee
      const result = await clientEmployeeService.createEmployee(
        employeeData,
        testClientOwnerUser.user_id,
        mockAuditContext,
      );
      createdUserIds.push(result.user_id);

      // THEN: Email should be lowercase
      expect(result.email).toBe(employeeData.email.toLowerCase());
    });

    it("[P1] 2.91-UNIT-025: should trim name whitespace", async () => {
      // GIVEN: Name with leading/trailing whitespace
      const employeeData = {
        email: `employee-trim-${Date.now()}@test.com`,
        name: "  Trimmed Name  ",
        store_id: testStore.store_id,
        role_id: testStoreRole.role_id,
        password: "TestPassword123!",
      };

      // WHEN: Creating employee
      const result = await clientEmployeeService.createEmployee(
        employeeData,
        testClientOwnerUser.user_id,
        mockAuditContext,
      );
      createdUserIds.push(result.user_id);

      // THEN: Name should be trimmed
      expect(result.name).toBe("Trimmed Name");
    });
  });

  describe("Store Ownership Authorization", () => {
    it("[P0] 2.91-UNIT-030: should reject employee creation for unowned store", async () => {
      // GIVEN: A store owned by a different user
      const otherOwnerPassword = await bcrypt.hash("TestPassword123!", 10);
      const otherOwner = await prisma.user.create({
        data: {
          public_id: generatePublicId(PUBLIC_ID_PREFIXES.USER),
          email: `other-owner-${Date.now()}@test.com`,
          name: "Other Owner",
          password_hash: otherOwnerPassword,
          status: "ACTIVE",
          is_client_user: true,
        },
      });
      createdUserIds.push(otherOwner.user_id);

      const otherCompany = await prisma.company.create({
        data: {
          public_id: generatePublicId(PUBLIC_ID_PREFIXES.COMPANY),
          name: `Other Company ${Date.now()}`,
          address: "456 Other Street",
          status: "ACTIVE",
          owner_user_id: otherOwner.user_id,
        },
      });
      createdCompanyIds.push(otherCompany.company_id);

      const otherStore = await prisma.store.create({
        data: {
          public_id: generatePublicId(PUBLIC_ID_PREFIXES.STORE),
          name: `Other Store ${Date.now()}`,
          company_id: otherCompany.company_id,
          status: "ACTIVE",
        },
      });
      createdStoreIds.push(otherStore.store_id);

      // WHEN/THEN: testClientOwnerUser tries to create employee in other's store
      await expect(
        clientEmployeeService.createEmployee(
          {
            email: `employee-unowned-${Date.now()}@test.com`,
            name: "Unauthorized Employee",
            store_id: otherStore.store_id,
            role_id: testStoreRole.role_id,
            password: "TestPassword123!",
          },
          testClientOwnerUser.user_id,
          mockAuditContext,
        ),
      ).rejects.toThrow(/does not belong to your organization/);
    });

    it("[P0] 2.91-UNIT-031: should reject employee creation for non-existent store", async () => {
      // GIVEN: Non-existent store ID
      const fakeStoreId = "00000000-0000-0000-0000-000000000000";

      // WHEN/THEN: Should throw error
      await expect(
        clientEmployeeService.createEmployee(
          {
            email: `employee-fake-store-${Date.now()}@test.com`,
            name: "Fake Store Employee",
            store_id: fakeStoreId,
            role_id: testStoreRole.role_id,
            password: "TestPassword123!",
          },
          testClientOwnerUser.user_id,
          mockAuditContext,
        ),
      ).rejects.toThrow(/does not belong to your organization|not exist/);
    });
  });
});

describe("2.91-UNIT: Client Employee Service - Employee Deletion", () => {
  it("[P0] 2.91-UNIT-040: should delete employee from owned store", async () => {
    // GIVEN: An employee created in client's store
    const employeeData = {
      email: `employee-delete-${Date.now()}@test.com`,
      name: "Employee To Delete",
      store_id: testStore.store_id,
      role_id: testStoreRole.role_id,
      password: "TestPassword123!",
    };

    const employee = await clientEmployeeService.createEmployee(
      employeeData,
      testClientOwnerUser.user_id,
      mockAuditContext,
    );

    // WHEN: Deleting the employee
    await clientEmployeeService.deleteEmployee(
      employee.user_id,
      testClientOwnerUser.user_id,
      mockAuditContext,
    );

    // THEN: Employee should not exist in database
    const deletedUser = await prisma.user.findUnique({
      where: { user_id: employee.user_id },
    });
    expect(deletedUser).toBeNull();

    // AND: User roles should be deleted
    const deletedRoles = await prisma.userRole.findMany({
      where: { user_id: employee.user_id },
    });
    expect(deletedRoles.length).toBe(0);
  });

  it("[P0] 2.91-UNIT-041: should reject deletion of employee from unowned store", async () => {
    // GIVEN: An employee in another owner's store
    const otherOwnerPassword = await bcrypt.hash("TestPassword123!", 10);
    const otherOwner = await prisma.user.create({
      data: {
        public_id: generatePublicId(PUBLIC_ID_PREFIXES.USER),
        email: `delete-other-owner-${Date.now()}@test.com`,
        name: "Delete Test Other Owner",
        password_hash: otherOwnerPassword,
        status: "ACTIVE",
        is_client_user: true,
      },
    });
    createdUserIds.push(otherOwner.user_id);

    const otherCompany = await prisma.company.create({
      data: {
        public_id: generatePublicId(PUBLIC_ID_PREFIXES.COMPANY),
        name: `Delete Test Other Company ${Date.now()}`,
        address: "789 Delete Street",
        status: "ACTIVE",
        owner_user_id: otherOwner.user_id,
      },
    });
    createdCompanyIds.push(otherCompany.company_id);

    const otherStore = await prisma.store.create({
      data: {
        public_id: generatePublicId(PUBLIC_ID_PREFIXES.STORE),
        name: `Delete Test Other Store ${Date.now()}`,
        company_id: otherCompany.company_id,
        status: "ACTIVE",
      },
    });
    createdStoreIds.push(otherStore.store_id);

    // Create employee in other's store
    const otherAuditContext: AuditContext = {
      userId: otherOwner.user_id,
      userEmail: otherOwner.email,
      userRoles: ["CLIENT_OWNER"],
      ipAddress: "127.0.0.1",
      userAgent: "vitest",
    };

    const otherEmployee = await clientEmployeeService.createEmployee(
      {
        email: `other-emp-delete-${Date.now()}@test.com`,
        name: "Other Owner Employee",
        store_id: otherStore.store_id,
        role_id: testStoreRole.role_id,
        password: "TestPassword123!",
      },
      otherOwner.user_id,
      otherAuditContext,
    );
    createdUserIds.push(otherEmployee.user_id);

    // WHEN/THEN: testClientOwnerUser tries to delete other's employee
    await expect(
      clientEmployeeService.deleteEmployee(
        otherEmployee.user_id,
        testClientOwnerUser.user_id,
        mockAuditContext,
      ),
    ).rejects.toThrow(/does not belong to your stores/);
  });

  it("[P0] 2.91-UNIT-042: should reject deletion of non-existent employee", async () => {
    // GIVEN: Non-existent user ID
    const fakeUserId = "00000000-0000-0000-0000-000000000000";

    // WHEN/THEN: Should throw error
    await expect(
      clientEmployeeService.deleteEmployee(
        fakeUserId,
        testClientOwnerUser.user_id,
        mockAuditContext,
      ),
    ).rejects.toThrow(/not found/);
  });
});

describe("2.91-UNIT: Client Employee Service - Employee Listing", () => {
  it("[P0] 2.91-UNIT-050: should list only employees from owned stores", async () => {
    // GIVEN: Create a few employees in client's store
    const employee1 = await clientEmployeeService.createEmployee(
      {
        email: `list-emp-1-${Date.now()}@test.com`,
        name: "List Employee 1",
        store_id: testStore.store_id,
        role_id: testStoreRole.role_id,
        password: "TestPassword123!",
      },
      testClientOwnerUser.user_id,
      mockAuditContext,
    );
    createdUserIds.push(employee1.user_id);

    const employee2 = await clientEmployeeService.createEmployee(
      {
        email: `list-emp-2-${Date.now()}@test.com`,
        name: "List Employee 2",
        store_id: testStore.store_id,
        role_id: testStoreRole.role_id,
        password: "TestPassword123!",
      },
      testClientOwnerUser.user_id,
      mockAuditContext,
    );
    createdUserIds.push(employee2.user_id);

    // WHEN: Getting employees
    const result = await clientEmployeeService.getEmployees(
      testClientOwnerUser.user_id,
    );

    // THEN: Should return employees
    expect(result.data.length).toBeGreaterThanOrEqual(2);

    // AND: All returned employees should have store from client's stores
    const clientStoreIds = await clientEmployeeService.getClientStoreIds(
      testClientOwnerUser.user_id,
    );
    for (const emp of result.data) {
      expect(clientStoreIds).toContain(emp.store_id);
    }
  });

  it("[P1] 2.91-UNIT-051: should support pagination", async () => {
    // GIVEN: Multiple employees exist (from previous tests)

    // WHEN: Getting first page with limit 1
    const page1 = await clientEmployeeService.getEmployees(
      testClientOwnerUser.user_id,
      { page: 1, limit: 1 },
    );

    // THEN: Should return paginated results
    expect(page1.meta.page).toBe(1);
    expect(page1.meta.limit).toBe(1);
    expect(page1.data.length).toBeLessThanOrEqual(1);
  });

  it("[P1] 2.91-UNIT-052: should support search filtering", async () => {
    // GIVEN: Create employee with unique name
    const uniqueName = `Searchable-${Date.now()}`;
    const searchableEmployee = await clientEmployeeService.createEmployee(
      {
        email: `searchable-${Date.now()}@test.com`,
        name: uniqueName,
        store_id: testStore.store_id,
        role_id: testStoreRole.role_id,
        password: "TestPassword123!",
      },
      testClientOwnerUser.user_id,
      mockAuditContext,
    );
    createdUserIds.push(searchableEmployee.user_id);

    // WHEN: Searching for the unique name
    const result = await clientEmployeeService.getEmployees(
      testClientOwnerUser.user_id,
      { search: uniqueName },
    );

    // THEN: Should find the employee
    expect(result.data.length).toBeGreaterThanOrEqual(1);
    expect(result.data.some((e) => e.name === uniqueName)).toBe(true);
  });
});

describe("6.14-UNIT: Client Employee Service - Credential Management", () => {
  describe("updateEmployeeEmail", () => {
    it("[P0] 6.14-UNIT-001: should update employee email successfully", async () => {
      // GIVEN: An existing employee
      const employee = await clientEmployeeService.createEmployee(
        {
          email: `emp-email-test-${Date.now()}@test.com`,
          name: "Email Test Employee",
          store_id: testStore.store_id,
          role_id: testStoreRole.role_id,
          password: "TestPassword123!",
        },
        testClientOwnerUser.user_id,
        mockAuditContext,
      );
      createdUserIds.push(employee.user_id);

      const newEmail = `newemail-${Date.now()}@test.com`;

      // WHEN: Updating employee email
      const updatedUser = await clientEmployeeService.updateEmployeeEmail(
        employee.user_id,
        newEmail,
        testClientOwnerUser.user_id,
        mockAuditContext,
      );

      // THEN: Email should be updated
      expect(updatedUser.email).toBe(newEmail);

      // AND: Database should reflect the change
      const dbUser = await prisma.user.findUnique({
        where: { user_id: employee.user_id },
      });
      expect(dbUser?.email).toBe(newEmail);
    });

    it("[P0] 6.14-UNIT-002: should reject email update for employee not belonging to client's stores", async () => {
      // GIVEN: Another client owner with their own employee
      const otherOwner = await prisma.user.create({
        data: {
          public_id: generatePublicId(PUBLIC_ID_PREFIXES.USER),
          email: `other-owner-${Date.now()}@test.com`,
          name: "Other Owner",
          password_hash: await bcrypt.hash("TestPassword123!", 10),
          status: "ACTIVE",
          is_client_user: true,
        },
      });
      createdUserIds.push(otherOwner.user_id);

      const otherCompany = await prisma.company.create({
        data: {
          public_id: generatePublicId(PUBLIC_ID_PREFIXES.COMPANY),
          name: `Other Company ${Date.now()}`,
          owner_user_id: otherOwner.user_id,
        },
      });
      createdCompanyIds.push(otherCompany.company_id);

      const otherStore = await prisma.store.create({
        data: {
          public_id: generatePublicId(PUBLIC_ID_PREFIXES.STORE),
          name: `Other Store ${Date.now()}`,
          company_id: otherCompany.company_id,
        },
      });
      createdStoreIds.push(otherStore.store_id);

      const otherEmployee = await clientEmployeeService.createEmployee(
        {
          email: `other-emp-${Date.now()}@test.com`,
          name: "Other Employee",
          store_id: otherStore.store_id,
          role_id: testStoreRole.role_id,
          password: "TestPassword123!",
        },
        otherOwner.user_id,
        mockAuditContext,
      );
      createdUserIds.push(otherEmployee.user_id);

      // WHEN/THEN: testClientOwnerUser tries to update other owner's employee email
      await expect(
        clientEmployeeService.updateEmployeeEmail(
          otherEmployee.user_id,
          "hacked@test.nuvana.local",
          testClientOwnerUser.user_id,
          mockAuditContext,
        ),
      ).rejects.toThrow(/does not belong to your stores/);
    });

    it("[P0] 6.14-UNIT-003: should reject duplicate email", async () => {
      // GIVEN: Two employees with different emails
      const employee1 = await clientEmployeeService.createEmployee(
        {
          email: `emp1-${Date.now()}@test.com`,
          name: "Employee 1",
          store_id: testStore.store_id,
          role_id: testStoreRole.role_id,
          password: "TestPassword123!",
        },
        testClientOwnerUser.user_id,
        mockAuditContext,
      );
      createdUserIds.push(employee1.user_id);

      const employee2 = await clientEmployeeService.createEmployee(
        {
          email: `emp2-${Date.now()}@test.com`,
          name: "Employee 2",
          store_id: testStore.store_id,
          role_id: testStoreRole.role_id,
          password: "TestPassword123!",
        },
        testClientOwnerUser.user_id,
        mockAuditContext,
      );
      createdUserIds.push(employee2.user_id);

      // WHEN/THEN: Trying to update employee2's email to employee1's email
      await expect(
        clientEmployeeService.updateEmployeeEmail(
          employee2.user_id,
          employee1.email,
          testClientOwnerUser.user_id,
          mockAuditContext,
        ),
      ).rejects.toThrow(/already in use/);
    });

    it("[P1] 6.14-UNIT-004: should create audit log for email update", async () => {
      // GIVEN: An existing employee
      const employee = await clientEmployeeService.createEmployee(
        {
          email: `emp-audit-${Date.now()}@test.com`,
          name: "Audit Test Employee",
          store_id: testStore.store_id,
          role_id: testStoreRole.role_id,
          password: "TestPassword123!",
        },
        testClientOwnerUser.user_id,
        mockAuditContext,
      );
      createdUserIds.push(employee.user_id);

      const oldEmail = employee.email;
      const newEmail = `newemail-audit-${Date.now()}@test.com`;

      // WHEN: Updating employee email
      await clientEmployeeService.updateEmployeeEmail(
        employee.user_id,
        newEmail,
        testClientOwnerUser.user_id,
        mockAuditContext,
      );

      // THEN: Audit log should be created
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          table_name: "users",
          record_id: employee.user_id,
          action: "EMPLOYEE_EMAIL_UPDATED",
        },
      });
      expect(auditLog).not.toBeNull();
      expect(auditLog?.old_values).toMatchObject({ email: oldEmail });
      expect(auditLog?.new_values).toMatchObject({ email: newEmail });
    });
  });

  describe("resetEmployeePassword", () => {
    it("[P0] 6.14-UNIT-010: should reset employee password successfully", async () => {
      // GIVEN: An existing employee
      const employee = await clientEmployeeService.createEmployee(
        {
          email: `emp-pwd-test-${Date.now()}@test.com`,
          name: "Password Test Employee",
          store_id: testStore.store_id,
          role_id: testStoreRole.role_id,
          password: "OldPassword123!",
        },
        testClientOwnerUser.user_id,
        mockAuditContext,
      );
      createdUserIds.push(employee.user_id);

      const oldPasswordHash = (
        await prisma.user.findUnique({
          where: { user_id: employee.user_id },
          select: { password_hash: true },
        })
      )?.password_hash;

      const newPassword = "NewSecurePass123!";

      // WHEN: Resetting employee password
      await clientEmployeeService.resetEmployeePassword(
        employee.user_id,
        newPassword,
        testClientOwnerUser.user_id,
        mockAuditContext,
      );

      // THEN: Password hash should be updated
      const updatedUser = await prisma.user.findUnique({
        where: { user_id: employee.user_id },
        select: { password_hash: true },
      });
      expect(updatedUser?.password_hash).not.toBe(oldPasswordHash);
      expect(updatedUser?.password_hash).not.toBeNull();

      // AND: New password should verify correctly
      const isValid = await bcrypt.compare(
        newPassword,
        updatedUser!.password_hash!,
      );
      expect(isValid).toBe(true);
    });

    it("[P0] 6.14-UNIT-011: should reject password reset for employee not belonging to client's stores", async () => {
      // GIVEN: Another client owner with their own employee (from previous test setup)
      const otherOwner = await prisma.user.create({
        data: {
          public_id: generatePublicId(PUBLIC_ID_PREFIXES.USER),
          email: `other-owner-pwd-${Date.now()}@test.com`,
          name: "Other Owner",
          password_hash: await bcrypt.hash("TestPassword123!", 10),
          status: "ACTIVE",
          is_client_user: true,
        },
      });
      createdUserIds.push(otherOwner.user_id);

      const otherCompany = await prisma.company.create({
        data: {
          public_id: generatePublicId(PUBLIC_ID_PREFIXES.COMPANY),
          name: `Other Company PWD ${Date.now()}`,
          owner_user_id: otherOwner.user_id,
        },
      });
      createdCompanyIds.push(otherCompany.company_id);

      const otherStore = await prisma.store.create({
        data: {
          public_id: generatePublicId(PUBLIC_ID_PREFIXES.STORE),
          name: `Other Store PWD ${Date.now()}`,
          company_id: otherCompany.company_id,
        },
      });
      createdStoreIds.push(otherStore.store_id);

      const otherEmployee = await clientEmployeeService.createEmployee(
        {
          email: `other-emp-pwd-${Date.now()}@test.com`,
          name: "Other Employee",
          store_id: otherStore.store_id,
          role_id: testStoreRole.role_id,
          password: "TestPassword123!",
        },
        otherOwner.user_id,
        mockAuditContext,
      );
      createdUserIds.push(otherEmployee.user_id);

      // WHEN/THEN: testClientOwnerUser tries to reset other owner's employee password
      await expect(
        clientEmployeeService.resetEmployeePassword(
          otherEmployee.user_id,
          "HackedPass123!",
          testClientOwnerUser.user_id,
          mockAuditContext,
        ),
      ).rejects.toThrow(/does not belong to your stores/);
    });

    it("[P0] 6.14-UNIT-012: should reject weak password (less than 8 characters)", async () => {
      // GIVEN: An existing employee
      const employee = await clientEmployeeService.createEmployee(
        {
          email: `emp-weak-${Date.now()}@test.com`,
          name: "Weak Password Test Employee",
          store_id: testStore.store_id,
          role_id: testStoreRole.role_id,
          password: "TestPassword123!",
        },
        testClientOwnerUser.user_id,
        mockAuditContext,
      );
      createdUserIds.push(employee.user_id);

      // WHEN/THEN: Trying to reset with weak password
      await expect(
        clientEmployeeService.resetEmployeePassword(
          employee.user_id,
          "weak",
          testClientOwnerUser.user_id,
          mockAuditContext,
        ),
      ).rejects.toThrow(/password strength/);
    });

    it("[P0] 6.14-UNIT-013: should reject password without uppercase letter", async () => {
      // GIVEN: An existing employee
      const employee = await clientEmployeeService.createEmployee(
        {
          email: `emp-noupper-${Date.now()}@test.com`,
          name: "No Upper Test Employee",
          store_id: testStore.store_id,
          role_id: testStoreRole.role_id,
          password: "TestPassword123!",
        },
        testClientOwnerUser.user_id,
        mockAuditContext,
      );
      createdUserIds.push(employee.user_id);

      // WHEN/THEN: Trying to reset with password without uppercase
      await expect(
        clientEmployeeService.resetEmployeePassword(
          employee.user_id,
          "lowercase123!",
          testClientOwnerUser.user_id,
          mockAuditContext,
        ),
      ).rejects.toThrow(/password strength/);
    });

    it("[P0] 6.14-UNIT-014: should reject password without number", async () => {
      // GIVEN: An existing employee
      const employee = await clientEmployeeService.createEmployee(
        {
          email: `emp-nonum-${Date.now()}@test.com`,
          name: "No Number Test Employee",
          store_id: testStore.store_id,
          role_id: testStoreRole.role_id,
          password: "TestPassword123!",
        },
        testClientOwnerUser.user_id,
        mockAuditContext,
      );
      createdUserIds.push(employee.user_id);

      // WHEN/THEN: Trying to reset with password without number
      await expect(
        clientEmployeeService.resetEmployeePassword(
          employee.user_id,
          "NoNumberPass!",
          testClientOwnerUser.user_id,
          mockAuditContext,
        ),
      ).rejects.toThrow(/password strength/);
    });

    it("[P1] 6.14-UNIT-015: should create audit log for password reset", async () => {
      // GIVEN: An existing employee
      const employee = await clientEmployeeService.createEmployee(
        {
          email: `emp-pwdaudit-${Date.now()}@test.com`,
          name: "Password Audit Test Employee",
          store_id: testStore.store_id,
          role_id: testStoreRole.role_id,
          password: "TestPassword123!",
        },
        testClientOwnerUser.user_id,
        mockAuditContext,
      );
      createdUserIds.push(employee.user_id);

      // WHEN: Resetting employee password
      await clientEmployeeService.resetEmployeePassword(
        employee.user_id,
        "NewSecurePass123!",
        testClientOwnerUser.user_id,
        mockAuditContext,
      );

      // THEN: Audit log should be created
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          table_name: "users",
          record_id: employee.user_id,
          action: "EMPLOYEE_PASSWORD_RESET",
        },
      });
      expect(auditLog).not.toBeNull();
      // Password hash should NOT be in audit log (security)
      expect(auditLog?.old_values).not.toHaveProperty("password_hash");
      expect(auditLog?.new_values).not.toHaveProperty("password_hash");
    });
  });
});

describe("2.91-UNIT: Client Employee Service - Store Roles API", () => {
  it("[P1] 2.91-UNIT-060: should return only STORE scope roles", async () => {
    // WHEN: Getting store roles
    const roles = await clientEmployeeService.getStoreRoles();

    // THEN: All roles should have STORE scope
    expect(roles.length).toBeGreaterThan(0);

    // Verify all returned roles are STORE scope
    for (const role of roles) {
      const dbRole = await prisma.role.findUnique({
        where: { role_id: role.role_id },
      });
      expect(dbRole?.scope).toBe("STORE");
    }
  });
});

/**
 * Password Strength Validation Tests
 *
 * Story: SEC-001 - Password Strength Enforcement
 *
 * These tests verify that employee creation enforces password strength
 * requirements at the service layer (defense-in-depth), preventing
 * weak passwords even if route validation is bypassed.
 *
 * Requirements:
 * - Minimum 8 characters
 * - At least one uppercase letter [A-Z]
 * - At least one lowercase letter [a-z]
 * - At least one number [0-9]
 * - At least one special character [!@#$%^&*(),.?":{}|<>]
 */
describe("SEC-001-UNIT: Client Employee Service - Password Strength Validation", () => {
  describe("Password Strength Requirements", () => {
    it("[P0] SEC-001-UNIT-001: should reject password without uppercase letter", async () => {
      // GIVEN: Employee data with password missing uppercase
      const employeeData = {
        email: `emp-noupper-${Date.now()}@test.com`,
        name: "No Uppercase Test",
        store_id: testStore.store_id,
        role_id: testStoreRole.role_id,
        password: "lowercase123!", // No uppercase letter
      };

      // WHEN/THEN: Creating employee should fail
      await expect(
        clientEmployeeService.createEmployee(
          employeeData,
          testClientOwnerUser.user_id,
          mockAuditContext,
        ),
      ).rejects.toThrow(/uppercase letter/i);
    });

    it("[P0] SEC-001-UNIT-002: should reject password without lowercase letter", async () => {
      // GIVEN: Employee data with password missing lowercase
      const employeeData = {
        email: `emp-nolower-${Date.now()}@test.com`,
        name: "No Lowercase Test",
        store_id: testStore.store_id,
        role_id: testStoreRole.role_id,
        password: "UPPERCASE123!", // No lowercase letter
      };

      // WHEN/THEN: Creating employee should fail
      await expect(
        clientEmployeeService.createEmployee(
          employeeData,
          testClientOwnerUser.user_id,
          mockAuditContext,
        ),
      ).rejects.toThrow(/lowercase letter/i);
    });

    it("[P0] SEC-001-UNIT-003: should reject password without number", async () => {
      // GIVEN: Employee data with password missing number
      const employeeData = {
        email: `emp-nonum-${Date.now()}@test.com`,
        name: "No Number Test",
        store_id: testStore.store_id,
        role_id: testStoreRole.role_id,
        password: "NoNumberHere!", // No number
      };

      // WHEN/THEN: Creating employee should fail
      await expect(
        clientEmployeeService.createEmployee(
          employeeData,
          testClientOwnerUser.user_id,
          mockAuditContext,
        ),
      ).rejects.toThrow(/number/i);
    });

    it("[P0] SEC-001-UNIT-004: should reject password without special character", async () => {
      // GIVEN: Employee data with password missing special character
      const employeeData = {
        email: `emp-nospec-${Date.now()}@test.com`,
        name: "No Special Test",
        store_id: testStore.store_id,
        role_id: testStoreRole.role_id,
        password: "NoSpecial123", // No special character
      };

      // WHEN/THEN: Creating employee should fail
      await expect(
        clientEmployeeService.createEmployee(
          employeeData,
          testClientOwnerUser.user_id,
          mockAuditContext,
        ),
      ).rejects.toThrow(/special character/i);
    });

    it("[P0] SEC-001-UNIT-005: should reject password shorter than 8 characters", async () => {
      // GIVEN: Employee data with short password
      const employeeData = {
        email: `emp-short-${Date.now()}@test.com`,
        name: "Short Password Test",
        store_id: testStore.store_id,
        role_id: testStoreRole.role_id,
        password: "Ab1!", // Too short (4 chars)
      };

      // WHEN/THEN: Creating employee should fail
      await expect(
        clientEmployeeService.createEmployee(
          employeeData,
          testClientOwnerUser.user_id,
          mockAuditContext,
        ),
      ).rejects.toThrow(/8 characters/i);
    });

    it("[P0] SEC-001-UNIT-006: should accept password meeting all requirements", async () => {
      // GIVEN: Employee data with strong password
      const employeeData = {
        email: `emp-strong-${Date.now()}@test.com`,
        name: "Strong Password Test",
        store_id: testStore.store_id,
        role_id: testStoreRole.role_id,
        password: "StrongPass123!", // Meets all requirements
      };

      // WHEN: Creating employee
      const result = await clientEmployeeService.createEmployee(
        employeeData,
        testClientOwnerUser.user_id,
        mockAuditContext,
      );
      createdUserIds.push(result.user_id);

      // THEN: Employee should be created successfully
      expect(result.user_id).toBeDefined();
      expect(result.email).toBe(employeeData.email.toLowerCase());
    });

    it("[P0] SEC-001-UNIT-007: should accept various valid special characters", async () => {
      // Test various special characters that should be accepted
      const specialChars = ["!", "@", "#", "$", "%", "^", "&", "*", "(", ")"];

      for (const char of specialChars) {
        const employeeData = {
          email: `emp-spec-${char.charCodeAt(0)}-${Date.now()}@test.com`,
          name: `Special Char ${char} Test`,
          store_id: testStore.store_id,
          role_id: testStoreRole.role_id,
          password: `ValidPass1${char}`,
        };

        // WHEN: Creating employee
        const result = await clientEmployeeService.createEmployee(
          employeeData,
          testClientOwnerUser.user_id,
          mockAuditContext,
        );
        createdUserIds.push(result.user_id);

        // THEN: Employee should be created
        expect(result.user_id).toBeDefined();
      }
    });
  });

  describe("Common Weak Password Patterns", () => {
    it("[P0] SEC-001-UNIT-010: should reject 'password1!' (no uppercase)", async () => {
      const employeeData = {
        email: `emp-weak1-${Date.now()}@test.com`,
        name: "Weak Password Test 1",
        store_id: testStore.store_id,
        role_id: testStoreRole.role_id,
        password: "password1!",
      };

      await expect(
        clientEmployeeService.createEmployee(
          employeeData,
          testClientOwnerUser.user_id,
          mockAuditContext,
        ),
      ).rejects.toThrow(/uppercase letter/i);
    });

    it("[P0] SEC-001-UNIT-011: should reject '12345678' (no letters or special)", async () => {
      const employeeData = {
        email: `emp-weak2-${Date.now()}@test.com`,
        name: "Weak Password Test 2",
        store_id: testStore.store_id,
        role_id: testStoreRole.role_id,
        password: "12345678",
      };

      await expect(
        clientEmployeeService.createEmployee(
          employeeData,
          testClientOwnerUser.user_id,
          mockAuditContext,
        ),
      ).rejects.toThrow(/uppercase letter|lowercase letter|special character/i);
    });

    it("[P0] SEC-001-UNIT-012: should reject 'abcdefgh' (no uppercase, number, or special)", async () => {
      const employeeData = {
        email: `emp-weak3-${Date.now()}@test.com`,
        name: "Weak Password Test 3",
        store_id: testStore.store_id,
        role_id: testStoreRole.role_id,
        password: "abcdefgh",
      };

      await expect(
        clientEmployeeService.createEmployee(
          employeeData,
          testClientOwnerUser.user_id,
          mockAuditContext,
        ),
      ).rejects.toThrow(/uppercase letter|number|special character/i);
    });

    it("[P0] SEC-001-UNIT-013: should reject 'ABCDEFGH' (no lowercase, number, or special)", async () => {
      const employeeData = {
        email: `emp-weak4-${Date.now()}@test.com`,
        name: "Weak Password Test 4",
        store_id: testStore.store_id,
        role_id: testStoreRole.role_id,
        password: "ABCDEFGH",
      };

      await expect(
        clientEmployeeService.createEmployee(
          employeeData,
          testClientOwnerUser.user_id,
          mockAuditContext,
        ),
      ).rejects.toThrow(/lowercase letter|number|special character/i);
    });

    it("[P0] SEC-001-UNIT-014: should reject 'Password1' (no special character)", async () => {
      const employeeData = {
        email: `emp-weak5-${Date.now()}@test.com`,
        name: "Weak Password Test 5",
        store_id: testStore.store_id,
        role_id: testStoreRole.role_id,
        password: "Password1",
      };

      await expect(
        clientEmployeeService.createEmployee(
          employeeData,
          testClientOwnerUser.user_id,
          mockAuditContext,
        ),
      ).rejects.toThrow(/special character/i);
    });
  });

  describe("Defense-in-Depth Validation", () => {
    it("[P0] SEC-001-UNIT-020: should validate password in service layer (defense-in-depth)", async () => {
      // This test verifies that password validation happens at the service layer,
      // not just at the route level. This is critical because:
      // 1. Future code paths might bypass route validation
      // 2. API bypass attacks might skip the Zod schema
      // 3. Internal calls might not go through the route layer

      // GIVEN: Weak password that would pass basic length check
      const employeeData = {
        email: `emp-defense-${Date.now()}@test.com`,
        name: "Defense In Depth Test",
        store_id: testStore.store_id,
        role_id: testStoreRole.role_id,
        password: "weakpassword", // 12 chars but weak
      };

      // WHEN/THEN: Service layer should reject it
      await expect(
        clientEmployeeService.createEmployee(
          employeeData,
          testClientOwnerUser.user_id,
          mockAuditContext,
        ),
      ).rejects.toThrow(/uppercase letter|number|special character/i);
    });
  });
});
