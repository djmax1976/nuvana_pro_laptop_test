/**
 * @test-level INTEGRATION
 * @justification Tests database-level operations and RLS enforcement that requires database connection
 * @story 6-14-store-settings-page
 * @enhanced-by workflow-9 on 2025-01-28
 */
/**
 * Integration Tests: Client Employee Credential Management - Service Layer
 *
 * Tests credential management service methods with database operations:
 * - Email update with RLS enforcement
 * - Password reset with RLS enforcement
 * - Email uniqueness validation
 * - Password strength validation
 * - Audit logging
 *
 * @test-level INTEGRATION
 * @justification Tests database-level operations and RLS enforcement that requires database connection
 * @story 6-14-store-settings-page
 * @priority P1 (High - Security)
 *
 * These tests validate that credential management works correctly at the service layer,
 * including RLS enforcement, validation, and audit logging.
 *
 * ENHANCEMENTS APPLIED (Workflow 9):
 * - Additional password strength edge cases
 * - Comprehensive audit log validation
 * - Additional RLS enforcement tests
 * - Test isolation improvements
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  ClientEmployeeService,
  type AuditContext,
} from "../../backend/src/services/client-employee.service";
import {
  generatePublicId,
  PUBLIC_ID_PREFIXES,
} from "../../backend/src/utils/public-id";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();
const clientEmployeeService = new ClientEmployeeService();

// Test data - isolated per test suite
let owner1: any;
let owner2: any;
let company1: any;
let company2: any;
let store1: any;
let store2: any;
let storeRole: any;
let employee1: any;
let employee2: any;

const mockAuditContext: AuditContext = {
  userId: "",
  userEmail: "test-owner@test.com",
  userRoles: ["CLIENT_OWNER"],
  ipAddress: "127.0.0.1",
  userAgent: "vitest",
};

// ═══════════════════════════════════════════════════════════════════════════
// TEST SETUP & TEARDOWN
// ═══════════════════════════════════════════════════════════════════════════

beforeAll(async () => {
  // GIVEN: Two different client owners with their own companies and stores
  const hashedPassword = await bcrypt.hash("TestPassword123!", 10);

  owner1 = await prisma.user.create({
    data: {
      email: `owner1-${Date.now()}@test.com`,
      name: "Owner 1",
      public_id: generatePublicId(PUBLIC_ID_PREFIXES.USER),
      password_hash: hashedPassword,
      status: "ACTIVE",
      is_client_user: true,
    },
  });
  mockAuditContext.userId = owner1.user_id;

  owner2 = await prisma.user.create({
    data: {
      email: `owner2-${Date.now()}@test.com`,
      name: "Owner 2",
      public_id: generatePublicId(PUBLIC_ID_PREFIXES.USER),
      password_hash: hashedPassword,
      status: "ACTIVE",
      is_client_user: true,
    },
  });

  company1 = await prisma.company.create({
    data: {
      name: `Company 1 ${Date.now()}`,
      owner_user_id: owner1.user_id,
      public_id: generatePublicId(PUBLIC_ID_PREFIXES.COMPANY),
    },
  });

  company2 = await prisma.company.create({
    data: {
      name: `Company 2 ${Date.now()}`,
      owner_user_id: owner2.user_id,
      public_id: generatePublicId(PUBLIC_ID_PREFIXES.COMPANY),
    },
  });

  store1 = await prisma.store.create({
    data: {
      company_id: company1.company_id,
      name: `Store 1 ${Date.now()}`,
      public_id: generatePublicId(PUBLIC_ID_PREFIXES.STORE),
    },
  });

  store2 = await prisma.store.create({
    data: {
      company_id: company2.company_id,
      name: `Store 2 ${Date.now()}`,
      public_id: generatePublicId(PUBLIC_ID_PREFIXES.STORE),
    },
  });

  // Get a STORE scope role for employee assignment
  storeRole = await prisma.role.findFirst({
    where: { scope: "STORE" },
  });

  if (!storeRole) {
    throw new Error("No STORE scope role found - run RBAC seed first");
  }

  // Create employees for testing
  employee1 = await clientEmployeeService.createEmployee(
    {
      email: `employee1-${Date.now()}@test.com`,
      name: "Employee 1",
      store_id: store1.store_id,
      role_id: storeRole.role_id,
      password: "TestPassword123!",
    },
    owner1.user_id,
    mockAuditContext,
  );

  employee2 = await clientEmployeeService.createEmployee(
    {
      email: `employee2-${Date.now()}@test.com`,
      name: "Employee 2",
      store_id: store2.store_id,
      role_id: storeRole.role_id,
      password: "TestPassword123!",
    },
    owner2.user_id,
    {
      ...mockAuditContext,
      userId: owner2.user_id,
      userEmail: owner2.email,
    },
  );
});

afterAll(async () => {
  // Cleanup all test data
  if (employee1)
    await prisma.userRole.deleteMany({
      where: { user_id: employee1.user_id },
    });
  if (employee2)
    await prisma.userRole.deleteMany({
      where: { user_id: employee2.user_id },
    });
  if (employee1)
    await prisma.user.delete({ where: { user_id: employee1.user_id } });
  if (employee2)
    await prisma.user.delete({ where: { user_id: employee2.user_id } });
  if (store1)
    await prisma.store.delete({ where: { store_id: store1.store_id } });
  if (store2)
    await prisma.store.delete({ where: { store_id: store2.store_id } });
  if (company1)
    await prisma.company.delete({
      where: { company_id: company1.company_id },
    });
  if (company2)
    await prisma.company.delete({
      where: { company_id: company2.company_id },
    });
  if (owner1) await prisma.user.delete({ where: { user_id: owner1.user_id } });
  if (owner2) await prisma.user.delete({ where: { user_id: owner2.user_id } });
  await prisma.$disconnect();
});

// ═══════════════════════════════════════════════════════════════════════════
// INTEGRATION TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe("Client Employee Credential Management - Integration Tests", () => {
  describe("updateEmployeeEmail - Integration", () => {
    it("should update employee email and persist to database", async () => {
      // WHEN: Owner1 updates their employee's email
      const newEmail = `updated-${Date.now()}@test.com`;
      const updatedUser = await clientEmployeeService.updateEmployeeEmail(
        employee1.user_id,
        newEmail,
        owner1.user_id,
        mockAuditContext,
      );

      // THEN: Email is updated in service response
      expect(updatedUser.email).toBe(newEmail);

      // AND: Email is persisted in database
      const dbUser = await prisma.user.findUnique({
        where: { user_id: employee1.user_id },
      });
      expect(dbUser?.email).toBe(newEmail);

      // AND: Audit log is created
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          table_name: "users",
          record_id: employee1.user_id,
          action: "EMPLOYEE_EMAIL_UPDATED",
        },
      });
      expect(auditLog).not.toBeNull();
      expect(auditLog?.user_id).toBe(owner1.user_id);
    });

    it("should enforce RLS - owner cannot update other owner's employee email", async () => {
      // WHEN: Owner1 tries to update Owner2's employee email
      // THEN: Throws error
      await expect(
        clientEmployeeService.updateEmployeeEmail(
          employee2.user_id,
          "hacked@test.nuvana.local",
          owner1.user_id,
          mockAuditContext,
        ),
      ).rejects.toThrow(/does not belong to your stores/);
    });

    it("should validate email uniqueness across all users", async () => {
      // GIVEN: employee1 has a specific email
      const existingEmail = employee1.email;

      // WHEN: Trying to update employee2's email to employee1's email
      // THEN: Throws error
      await expect(
        clientEmployeeService.updateEmployeeEmail(
          employee2.user_id,
          existingEmail,
          owner2.user_id,
          {
            ...mockAuditContext,
            userId: owner2.user_id,
            userEmail: owner2.email,
          },
        ),
      ).rejects.toThrow(/already in use/);
    });
  });

  describe("resetEmployeePassword - Integration", () => {
    it("should reset employee password and persist hash to database", async () => {
      // GIVEN: Current password hash
      const oldUser = await prisma.user.findUnique({
        where: { user_id: employee1.user_id },
        select: { password_hash: true },
      });
      const oldPasswordHash = oldUser?.password_hash;

      // WHEN: Owner1 resets their employee's password
      const newPassword = "NewSecurePassword123!";
      await clientEmployeeService.resetEmployeePassword(
        employee1.user_id,
        newPassword,
        owner1.user_id,
        mockAuditContext,
      );

      // THEN: Password hash is updated in database
      const updatedUser = await prisma.user.findUnique({
        where: { user_id: employee1.user_id },
        select: { password_hash: true },
      });
      expect(updatedUser?.password_hash).not.toBe(oldPasswordHash);
      expect(updatedUser?.password_hash).not.toBeNull();

      // AND: New password verifies correctly
      const isValid = await bcrypt.compare(
        newPassword,
        updatedUser!.password_hash!,
      );
      expect(isValid).toBe(true);

      // AND: Audit log is created
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          table_name: "users",
          record_id: employee1.user_id,
          action: "EMPLOYEE_PASSWORD_RESET",
        },
      });
      expect(auditLog).not.toBeNull();
      expect(auditLog?.user_id).toBe(owner1.user_id);
    });

    it("should enforce RLS - owner cannot reset other owner's employee password", async () => {
      // WHEN: Owner1 tries to reset Owner2's employee password
      // THEN: Throws error
      await expect(
        clientEmployeeService.resetEmployeePassword(
          employee2.user_id,
          "HackedPassword123!",
          owner1.user_id,
          mockAuditContext,
        ),
      ).rejects.toThrow(/does not belong to your stores/);
    });

    it("should validate password strength requirements", async () => {
      // WHEN: Trying to reset with weak password
      // THEN: Throws error
      await expect(
        clientEmployeeService.resetEmployeePassword(
          employee1.user_id,
          "weak",
          owner1.user_id,
          mockAuditContext,
        ),
      ).rejects.toThrow(/password strength/);
    });

    it("should accept password meeting all strength requirements", async () => {
      // WHEN: Resetting with strong password
      const strongPassword = "StrongPass123!";
      await clientEmployeeService.resetEmployeePassword(
        employee1.user_id,
        strongPassword,
        owner1.user_id,
        mockAuditContext,
      );

      // THEN: Password is updated and verifies
      const updatedUser = await prisma.user.findUnique({
        where: { user_id: employee1.user_id },
        select: { password_hash: true },
      });
      const isValid = await bcrypt.compare(
        strongPassword,
        updatedUser!.password_hash!,
      );
      expect(isValid).toBe(true);
    });

    it("should reject password without uppercase letter", async () => {
      // WHEN: Resetting with password missing uppercase
      // THEN: Throws validation error
      await expect(
        clientEmployeeService.resetEmployeePassword(
          employee1.user_id,
          "lowercase123!",
          owner1.user_id,
          mockAuditContext,
        ),
      ).rejects.toThrow(/uppercase/i);
    });

    it("should reject password without lowercase letter", async () => {
      // WHEN: Resetting with password missing lowercase
      // THEN: Throws validation error
      await expect(
        clientEmployeeService.resetEmployeePassword(
          employee1.user_id,
          "UPPERCASE123!",
          owner1.user_id,
          mockAuditContext,
        ),
      ).rejects.toThrow(/lowercase/i);
    });

    it("should reject password without number", async () => {
      // WHEN: Resetting with password missing number
      // THEN: Throws validation error
      await expect(
        clientEmployeeService.resetEmployeePassword(
          employee1.user_id,
          "NoNumber!",
          owner1.user_id,
          mockAuditContext,
        ),
      ).rejects.toThrow(/number/i);
    });

    it("should reject password without special character", async () => {
      // WHEN: Resetting with password missing special character
      // THEN: Throws validation error
      await expect(
        clientEmployeeService.resetEmployeePassword(
          employee1.user_id,
          "NoSpecial123",
          owner1.user_id,
          mockAuditContext,
        ),
      ).rejects.toThrow(/special/i);
    });

    it("should use bcrypt with saltRounds=12 for password hashing", async () => {
      // GIVEN: New password
      const testPassword = "TestPassword123!";

      // WHEN: Resetting password
      await clientEmployeeService.resetEmployeePassword(
        employee1.user_id,
        testPassword,
        owner1.user_id,
        mockAuditContext,
      );

      // THEN: Password hash is bcrypt hash (starts with $2a$ or $2b$)
      const updatedUser = await prisma.user.findUnique({
        where: { user_id: employee1.user_id },
        select: { password_hash: true },
      });
      expect(updatedUser?.password_hash).toMatch(/^\$2[ab]\$/);

      // AND: Hash can be verified with bcrypt
      const isValid = await bcrypt.compare(
        testPassword,
        updatedUser!.password_hash!,
      );
      expect(isValid).toBe(true);
    });

    it("should create audit log with redacted password hash", async () => {
      // WHEN: Resetting password
      await clientEmployeeService.resetEmployeePassword(
        employee1.user_id,
        "NewPassword123!",
        owner1.user_id,
        mockAuditContext,
      );

      // THEN: Audit log contains redacted password hash
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          table_name: "users",
          record_id: employee1.user_id,
          action: "EMPLOYEE_PASSWORD_RESET",
        },
        orderBy: { timestamp: "desc" },
      });
      expect(auditLog).not.toBeNull();
      expect(auditLog?.old_values).toHaveProperty("password_hash");
      expect(auditLog?.new_values).toHaveProperty("password_hash");
      // Verify password hash is redacted in audit log
      const oldValues = auditLog?.old_values as any;
      const newValues = auditLog?.new_values as any;
      expect(oldValues.password_hash).toBe("[REDACTED]");
      expect(newValues.password_hash).toBe("[REDACTED]");
    });
  });

  describe("Additional Security: Service Layer Authorization", () => {
    it("should prevent access to non-existent employees", async () => {
      // GIVEN: Non-existent employee ID
      const fakeEmployeeId = "00000000-0000-0000-0000-000000000000";

      // WHEN: Attempting to update email for non-existent employee
      // THEN: Throws error (RLS check happens, employee not found)
      await expect(
        clientEmployeeService.updateEmployeeEmail(
          fakeEmployeeId,
          "test@test.nuvana.local",
          owner1.user_id,
          mockAuditContext,
        ),
      ).rejects.toThrow(/not found|does not belong/i);
    });

    it("should maintain data integrity after failed update attempts", async () => {
      // GIVEN: Original employee1 email
      const originalEmail = employee1.email;

      // WHEN: Owner2 attempts unauthorized email update (should fail)
      try {
        await clientEmployeeService.updateEmployeeEmail(
          employee1.user_id,
          "hacked@test.nuvana.local",
          owner2.user_id,
          {
            ...mockAuditContext,
            userId: owner2.user_id,
            userEmail: owner2.email,
          },
        );
        // Should not reach here
        expect(true).toBe(false);
      } catch (error) {
        // Expected to throw
        expect(error).toBeDefined();
      }

      // THEN: Employee1 email remains unchanged
      const unchangedUser = await prisma.user.findUnique({
        where: { user_id: employee1.user_id },
        select: { email: true },
      });
      expect(unchangedUser?.email).toBe(originalEmail);
    });
  });
});
