import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { userAdminService } from "../../backend/src/services/user-admin.service";
import { createUser } from "../support/factories";

/**
 * Integration Tests: User Creation Service (PRODUCTION GRADE)
 *
 * Tests the user creation business logic from:
 * - backend/src/services/user-admin.service.ts (createUser method)
 *
 * IMPROVEMENTS:
 * - Uses separate test database connection
 * - Proper cleanup with global afterAll
 * - No transaction isolation needed as each test uses unique emails
 * - Production-ready and CI/CD safe
 *
 * Medium speed: Each test runs in ~100-300ms
 * Purpose: Verify business logic and database operations work correctly
 */

const prisma = new PrismaClient();

// Create audit user for tests
let auditUser: any = null;
let mockAuditContext: any = null;

// Track all test data for cleanup
const testEmails: string[] = [];

function registerTestEmail(email: string) {
  testEmails.push(email);
  return email;
}

// Global setup - create audit user once
beforeAll(async () => {
  // Create audit user for all tests
  const auditEmail = "integration-test-audit@test.local";

  // Clean up if exists from previous run
  const existingAuditUser = await prisma.user.findUnique({
    where: { email: auditEmail },
  });

  if (existingAuditUser) {
    await prisma.userRole.deleteMany({
      where: { user_id: existingAuditUser.user_id },
    });
    await prisma.user.delete({ where: { user_id: existingAuditUser.user_id } });
  }

  // Create fresh audit user
  const userData = createUser({ email: auditEmail });
  auditUser = await prisma.user.create({ data: userData });

  mockAuditContext = {
    userId: auditUser.user_id,
    userEmail: auditUser.email,
    userRoles: ["SUPERADMIN"],
    ipAddress: "127.0.0.1",
    userAgent: "test-agent",
  };
});

// Global cleanup - remove all test data
afterAll(async () => {
  // Clean up all test users
  for (const email of testEmails) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      // Clean up owned companies first
      const companies = await prisma.company.findMany({
        where: { owner_user_id: user.user_id },
      });

      for (const company of companies) {
        await prisma.store.deleteMany({
          where: { company_id: company.company_id },
        });
        await prisma.userRole.deleteMany({
          where: { company_id: company.company_id },
        });
        await prisma.company.delete({
          where: { company_id: company.company_id },
        });
      }

      await prisma.userRole.deleteMany({ where: { user_id: user.user_id } });
      await prisma.user.delete({ where: { user_id: user.user_id } });
    }
  }

  // Clean up audit user
  if (auditUser) {
    await prisma.userRole.deleteMany({ where: { user_id: auditUser.user_id } });
    await prisma.user.delete({ where: { user_id: auditUser.user_id } });
  }

  // Close connection
  await prisma.$disconnect();
});

describe("User Creation Service - Basic User Creation", () => {
  it("should create user with SYSTEM role", async () => {
    // GIVEN: Valid user data with SYSTEM role
    const systemRole = await prisma.role.findFirst({
      where: { scope: "SYSTEM" },
    });
    expect(systemRole).not.toBeNull();

    const email = registerTestEmail("service-test-basic@test.local");
    const userData = {
      email,
      name: "Test User",
      password: "TestPassword123!",
      roles: [
        {
          role_id: systemRole!.role_id,
          scope_type: "SYSTEM" as const,
        },
      ],
    };

    // WHEN: Creating user via service
    const result = await userAdminService.createUser(
      userData,
      mockAuditContext,
    );

    // THEN: User is created with correct data
    expect(result).toHaveProperty("user_id");
    expect(result.email).toBe(userData.email);
    expect(result.name).toBe(userData.name);
    expect(result.status).toBe("ACTIVE");
    expect(result.roles).toHaveLength(1);
    expect(result.roles[0].role.code).toBe(systemRole!.code);

    // AND: Password is hashed
    const dbUser = await prisma.user.findUnique({
      where: { email: userData.email },
    });
    expect(dbUser?.password_hash).not.toBeNull();
    expect(dbUser?.password_hash).not.toBe(userData.password);
  });

  it("should create user without password (for SSO)", async () => {
    // GIVEN: User data without password
    const systemRole = await prisma.role.findFirst({
      where: { scope: "SYSTEM" },
    });

    const email = registerTestEmail("service-test-sso@test.local");
    const userData = {
      email,
      name: "SSO User",
      roles: [
        {
          role_id: systemRole!.role_id,
          scope_type: "SYSTEM" as const,
        },
      ],
    };

    // WHEN: Creating user
    const result = await userAdminService.createUser(
      userData,
      mockAuditContext,
    );

    // THEN: User is created without password hash
    expect(result.user_id).toBeDefined();

    const dbUser = await prisma.user.findUnique({
      where: { email: userData.email },
    });
    expect(dbUser?.password_hash).toBeNull();
  });
});

describe("User Creation Service - CLIENT_OWNER with Company Creation", () => {
  it("should create user with CLIENT_OWNER role and company", async () => {
    // GIVEN: CLIENT_OWNER role assignment with company details
    const clientOwnerRole = await prisma.role.findFirst({
      where: { code: "CLIENT_OWNER" },
    });
    expect(clientOwnerRole).not.toBeNull();

    const email = registerTestEmail("owner-test@test.local");
    const userData = {
      email,
      name: "Company Owner",
      password: "TestPassword123!",
      roles: [
        {
          role_id: clientOwnerRole!.role_id,
          scope_type: "COMPANY" as const,
        },
      ],
      companyName: "Test Company Inc",
      companyAddress: "123 Test Street",
    };

    // WHEN: Creating CLIENT_OWNER user
    const result = await userAdminService.createUser(
      userData,
      mockAuditContext,
    );

    // THEN: User is created
    expect(result.user_id).toBeDefined();
    expect(result.roles).toHaveLength(1);
    expect(result.roles[0].role.code).toBe("CLIENT_OWNER");

    // AND: Company is created and owned by user
    const company = await prisma.company.findFirst({
      where: { owner_user_id: result.user_id },
    });
    expect(company).not.toBeNull();
    expect(company?.name).toBe("Test Company Inc");
    expect(company?.address).toBe("123 Test Street");
    expect(company?.status).toBe("ACTIVE");
    expect(company?.owner_user_id).toBe(result.user_id);
  });

  it("should reject CLIENT_OWNER creation without company name", async () => {
    // GIVEN: CLIENT_OWNER role without company name
    const clientOwnerRole = await prisma.role.findFirst({
      where: { code: "CLIENT_OWNER" },
    });

    const email = registerTestEmail("owner-no-name@test.local");
    const userData = {
      email,
      name: "Company Owner",
      password: "TestPassword123!",
      roles: [
        {
          role_id: clientOwnerRole!.role_id,
          scope_type: "COMPANY" as const,
        },
      ],
      companyAddress: "123 Test Street",
      // Missing companyName
    };

    // WHEN/THEN: Should throw validation error
    await expect(
      userAdminService.createUser(userData, mockAuditContext),
    ).rejects.toThrow(/Company name is required/);
  });

  it("should reject CLIENT_OWNER creation without company address", async () => {
    // GIVEN: CLIENT_OWNER role without company address
    const clientOwnerRole = await prisma.role.findFirst({
      where: { code: "CLIENT_OWNER" },
    });

    const email = registerTestEmail("owner-no-address@test.local");
    const userData = {
      email,
      name: "Company Owner",
      password: "TestPassword123!",
      roles: [
        {
          role_id: clientOwnerRole!.role_id,
          scope_type: "COMPANY" as const,
        },
      ],
      companyName: "Test Company",
      // Missing companyAddress
    };

    // WHEN/THEN: Should throw validation error
    await expect(
      userAdminService.createUser(userData, mockAuditContext),
    ).rejects.toThrow(/Company address is required/);
  });
});

describe("User Creation Service - Validation", () => {
  it("should reject invalid email format", async () => {
    // GIVEN: Invalid email
    const systemRole = await prisma.role.findFirst({
      where: { scope: "SYSTEM" },
    });

    const userData = {
      email: "not-an-email",
      name: "Test User",
      password: "TestPassword123!",
      roles: [
        {
          role_id: systemRole!.role_id,
          scope_type: "SYSTEM" as const,
        },
      ],
    };

    // WHEN/THEN: Should throw validation error
    await expect(
      userAdminService.createUser(userData, mockAuditContext),
    ).rejects.toThrow(/Invalid email format/);
  });

  it("should reject empty name", async () => {
    // GIVEN: Empty name
    const systemRole = await prisma.role.findFirst({
      where: { scope: "SYSTEM" },
    });

    const email = registerTestEmail("validation-empty-name@test.local");
    const userData = {
      email,
      name: "",
      password: "TestPassword123!",
      roles: [
        {
          role_id: systemRole!.role_id,
          scope_type: "SYSTEM" as const,
        },
      ],
    };

    // WHEN/THEN: Should throw validation error
    await expect(
      userAdminService.createUser(userData, mockAuditContext),
    ).rejects.toThrow(/Name is required/);
  });

  it("should reject whitespace-only name", async () => {
    // GIVEN: Whitespace-only name
    const systemRole = await prisma.role.findFirst({
      where: { scope: "SYSTEM" },
    });

    const email = registerTestEmail("validation-whitespace-name@test.local");
    const userData = {
      email,
      name: "   ",
      password: "TestPassword123!",
      roles: [
        {
          role_id: systemRole!.role_id,
          scope_type: "SYSTEM" as const,
        },
      ],
    };

    // WHEN/THEN: Should throw validation error
    await expect(
      userAdminService.createUser(userData, mockAuditContext),
    ).rejects.toThrow(/Name is required/);
  });

  it("should reject duplicate email", async () => {
    // GIVEN: Create first user
    const systemRole = await prisma.role.findFirst({
      where: { scope: "SYSTEM" },
    });

    const email = registerTestEmail("validation-duplicate@test.local");
    const userData = {
      email,
      name: "First User",
      password: "TestPassword123!",
      roles: [
        {
          role_id: systemRole!.role_id,
          scope_type: "SYSTEM" as const,
        },
      ],
    };

    await userAdminService.createUser(userData, mockAuditContext);

    // WHEN: Attempting to create another user with same email
    const duplicateData = {
      ...userData,
      name: "Second User",
    };

    // THEN: Should throw validation error
    await expect(
      userAdminService.createUser(duplicateData, mockAuditContext),
    ).rejects.toThrow(/already exists/);
  });

  it("should reject user creation without roles", async () => {
    // GIVEN: User data without roles
    const email = registerTestEmail("validation-no-roles@test.local");
    const userData = {
      email,
      name: "Test User",
      password: "TestPassword123!",
      roles: [],
    };

    // WHEN/THEN: Should throw validation error
    await expect(
      userAdminService.createUser(userData, mockAuditContext),
    ).rejects.toThrow(/at least one role/);
  });

  it("should reject short password", async () => {
    // GIVEN: Password shorter than 8 characters
    const systemRole = await prisma.role.findFirst({
      where: { scope: "SYSTEM" },
    });

    const email = registerTestEmail("validation-short-password@test.local");
    const userData = {
      email,
      name: "Test User",
      password: "Short1!",
      roles: [
        {
          role_id: systemRole!.role_id,
          scope_type: "SYSTEM" as const,
        },
      ],
    };

    // WHEN/THEN: Should throw validation error
    await expect(
      userAdminService.createUser(userData, mockAuditContext),
    ).rejects.toThrow(/at least 8 characters/);
  });
});

describe("User Creation Service - Transaction Rollback", () => {
  it("should rollback user creation if role assignment fails", async () => {
    // GIVEN: Invalid role_id
    const email = registerTestEmail("transaction-rollback@test.local");
    const userData = {
      email,
      name: "Test User",
      password: "TestPassword123!",
      roles: [
        {
          role_id: "00000000-0000-0000-0000-000000000000", // Non-existent role
          scope_type: "SYSTEM" as const,
        },
      ],
    };

    // WHEN: Attempting to create user with invalid role
    await expect(
      userAdminService.createUser(userData, mockAuditContext),
    ).rejects.toThrow();

    // THEN: User should not exist in database (transaction rolled back)
    const user = await prisma.user.findUnique({
      where: { email: userData.email },
    });
    expect(user).toBeNull();
  });
});
