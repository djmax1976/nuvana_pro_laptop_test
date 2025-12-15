/**
 * Unit Tests: LOTTERY_MANUAL_ENTRY Permission
 *
 * Tests permission configuration for LOTTERY_MANUAL_ENTRY:
 * - Permission exists in PERMISSIONS object
 * - SHIFT_MANAGER has permission by default
 * - STORE_MANAGER has permission by default
 * - CLIENT_OWNER has permission by default
 * - CASHIER does NOT have permission by default
 * - CASHIER can be granted permission (client-assignable)
 *
 * @test-level UNIT
 * @justification Tests permission configuration without database operations
 * @story 10.2 - Database Schema & Pack Activation Tracking
 * @priority P1 (High - Security, Authorization)
 *
 * RED PHASE: These tests will fail until permission is added to constants.
 */

import { describe, it, expect } from "vitest";
import {
  PERMISSIONS,
  CLIENT_ASSIGNABLE_PERMISSIONS,
} from "../../backend/src/constants/permissions";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ═══════════════════════════════════════════════════════════════════════════
// PERMISSION CONFIGURATION TESTS (AC #4)
// ═══════════════════════════════════════════════════════════════════════════

describe("10.2-UNIT: LOTTERY_MANUAL_ENTRY Permission Configuration", () => {
  it("TEST-10.2-P1: [P1] LOTTERY_MANUAL_ENTRY permission exists in PERMISSIONS object", () => {
    // GIVEN: Permission constants are loaded
    // WHEN: Checking for LOTTERY_MANUAL_ENTRY in PERMISSIONS
    const permissionCode = PERMISSIONS.LOTTERY_MANUAL_ENTRY;

    // THEN: Permission exists with correct code
    expect(permissionCode, "LOTTERY_MANUAL_ENTRY should exist").toBeDefined();
    expect(
      permissionCode,
      "Permission code should be LOTTERY_MANUAL_ENTRY",
    ).toBe("LOTTERY_MANUAL_ENTRY");

    // Verify permission is in CLIENT_ASSIGNABLE_PERMISSIONS (scope: STORE)
    expect(
      CLIENT_ASSIGNABLE_PERMISSIONS.includes(permissionCode),
      "LOTTERY_MANUAL_ENTRY should be in CLIENT_ASSIGNABLE_PERMISSIONS (STORE scope)",
    ).toBe(true);
  });

  it("TEST-10.2-P2: [P1] SHIFT_MANAGER has LOTTERY_MANUAL_ENTRY by default", async () => {
    // GIVEN: RBAC is seeded and SHIFT_MANAGER role exists
    // WHEN: Checking SHIFT_MANAGER role permissions in database
    const shiftManagerRole = await prisma.role.findUnique({
      where: { code: "SHIFT_MANAGER" },
      include: {
        role_permissions: {
          include: {
            permission: true,
          },
        },
      },
    });

    // THEN: LOTTERY_MANUAL_ENTRY permission is assigned
    expect(shiftManagerRole, "SHIFT_MANAGER role should exist").toBeDefined();
    const hasPermission = shiftManagerRole?.role_permissions.some(
      (rp) => rp.permission.code === "LOTTERY_MANUAL_ENTRY",
    );
    expect(
      hasPermission,
      "SHIFT_MANAGER should have LOTTERY_MANUAL_ENTRY permission",
    ).toBe(true);
  });

  it("TEST-10.2-P3: [P1] CASHIER does not have LOTTERY_MANUAL_ENTRY by default", async () => {
    // GIVEN: RBAC is seeded and CASHIER role exists (if it exists)
    // WHEN: Checking CASHIER role permissions in database
    const cashierRole = await prisma.role.findUnique({
      where: { code: "CASHIER" },
      include: {
        role_permissions: {
          include: {
            permission: true,
          },
        },
      },
    });

    // THEN: LOTTERY_MANUAL_ENTRY permission is NOT assigned by default
    // Note: CASHIER role may not exist in seed, which is also acceptable
    if (cashierRole) {
      const hasPermission = cashierRole.role_permissions.some(
        (rp) => rp.permission.code === "LOTTERY_MANUAL_ENTRY",
      );
      expect(
        hasPermission,
        "CASHIER should NOT have LOTTERY_MANUAL_ENTRY permission by default",
      ).toBe(false);
    } else {
      // CASHIER role doesn't exist in seed, which means it doesn't have the permission
      expect(
        true,
        "CASHIER role does not exist, so it doesn't have permission",
      ).toBe(true);
    }
  });

  it("TEST-10.2-P4: [P1] STORE_MANAGER has LOTTERY_MANUAL_ENTRY by default", async () => {
    // GIVEN: RBAC is seeded and STORE_MANAGER role exists
    // WHEN: Checking STORE_MANAGER role permissions in database
    const storeManagerRole = await prisma.role.findUnique({
      where: { code: "STORE_MANAGER" },
      include: {
        role_permissions: {
          include: {
            permission: true,
          },
        },
      },
    });

    // THEN: LOTTERY_MANUAL_ENTRY permission is assigned
    expect(storeManagerRole, "STORE_MANAGER role should exist").toBeDefined();
    const hasPermission = storeManagerRole?.role_permissions.some(
      (rp) => rp.permission.code === "LOTTERY_MANUAL_ENTRY",
    );
    expect(
      hasPermission,
      "STORE_MANAGER should have LOTTERY_MANUAL_ENTRY permission",
    ).toBe(true);
  });

  it("TEST-10.2-P5: [P1] CLIENT_OWNER has LOTTERY_MANUAL_ENTRY by default", async () => {
    // GIVEN: RBAC is seeded and CLIENT_OWNER role exists
    // WHEN: Checking CLIENT_OWNER role permissions in database
    const clientOwnerRole = await prisma.role.findUnique({
      where: { code: "CLIENT_OWNER" },
      include: {
        role_permissions: {
          include: {
            permission: true,
          },
        },
      },
    });

    // THEN: LOTTERY_MANUAL_ENTRY permission is assigned
    expect(clientOwnerRole, "CLIENT_OWNER role should exist").toBeDefined();
    const hasPermission = clientOwnerRole?.role_permissions.some(
      (rp) => rp.permission.code === "LOTTERY_MANUAL_ENTRY",
    );
    expect(
      hasPermission,
      "CLIENT_OWNER should have LOTTERY_MANUAL_ENTRY permission",
    ).toBe(true);
  });

  it("TEST-10.2-P6: [P1] Enhanced assertions - Permission code format validation", () => {
    // GIVEN: Permission constants are loaded
    // WHEN: Checking permission code format
    const permissionCode = PERMISSIONS.LOTTERY_MANUAL_ENTRY;

    // THEN: Permission code follows naming convention (RESOURCE_ACTION)
    expect(typeof permissionCode, "Permission code should be a string").toBe(
      "string",
    );
    expect(permissionCode, "Permission code should not be empty").not.toBe("");
    expect(
      permissionCode,
      "Permission code should match pattern RESOURCE_ACTION",
    ).toMatch(/^[A-Z_]+$/);
    expect(
      permissionCode.split("_").length,
      "Permission should have at least 2 parts",
    ).toBeGreaterThanOrEqual(2);
  });

  it("TEST-10.2-P7: [P1] Enhanced assertions - Permission is client-assignable (STORE scope)", () => {
    // GIVEN: Permission constants are loaded
    // WHEN: Checking if permission is client-assignable
    const permissionCode = PERMISSIONS.LOTTERY_MANUAL_ENTRY;

    // THEN: Permission should be in CLIENT_ASSIGNABLE_PERMISSIONS
    expect(
      CLIENT_ASSIGNABLE_PERMISSIONS.includes(permissionCode),
      "LOTTERY_MANUAL_ENTRY should be client-assignable (STORE scope)",
    ).toBe(true);

    // Verify it's an array and contains the permission
    expect(
      Array.isArray(CLIENT_ASSIGNABLE_PERMISSIONS),
      "CLIENT_ASSIGNABLE_PERMISSIONS should be an array",
    ).toBe(true);
    expect(
      CLIENT_ASSIGNABLE_PERMISSIONS.length,
      "CLIENT_ASSIGNABLE_PERMISSIONS should not be empty",
    ).toBeGreaterThan(0);
  });

  it("TEST-10.2-P8: [P1] Enhanced assertions - All default roles have permission assigned", async () => {
    // GIVEN: RBAC is seeded
    // WHEN: Checking all default roles that should have permission
    const rolesToCheck = ["SHIFT_MANAGER", "STORE_MANAGER", "CLIENT_OWNER"];

    for (const roleCode of rolesToCheck) {
      const role = await prisma.role.findUnique({
        where: { code: roleCode },
        include: {
          role_permissions: {
            include: {
              permission: true,
            },
          },
        },
      });

      // THEN: Each role should have LOTTERY_MANUAL_ENTRY permission
      expect(role, `${roleCode} role should exist`).toBeDefined();
      const hasPermission = role?.role_permissions.some(
        (rp) => rp.permission.code === "LOTTERY_MANUAL_ENTRY",
      );
      expect(
        hasPermission,
        `${roleCode} should have LOTTERY_MANUAL_ENTRY permission`,
      ).toBe(true);
    }
  });

  it("TEST-10.2-P9: [P1] Security test - Permission cannot be assigned to unauthorized roles by default", async () => {
    // GIVEN: RBAC is seeded
    // WHEN: Checking roles that should NOT have permission by default
    const unauthorizedRoles = ["CASHIER"]; // Add other roles that shouldn't have it

    for (const roleCode of unauthorizedRoles) {
      const role = await prisma.role.findUnique({
        where: { code: roleCode },
        include: {
          role_permissions: {
            include: {
              permission: true,
            },
          },
        },
      });

      // THEN: Unauthorized roles should NOT have permission by default
      if (role) {
        const hasPermission = role.role_permissions.some(
          (rp) => rp.permission.code === "LOTTERY_MANUAL_ENTRY",
        );
        expect(
          hasPermission,
          `${roleCode} should NOT have LOTTERY_MANUAL_ENTRY permission by default`,
        ).toBe(false);
      }
      // If role doesn't exist, that's also acceptable (no permission assigned)
    }
  });

  it("TEST-10.2-P10: [P1] Enhanced assertions - Permission exists in permission table", async () => {
    // GIVEN: Database is seeded
    // WHEN: Checking if permission exists in permissions table
    const permission = await prisma.permission.findUnique({
      where: { code: "LOTTERY_MANUAL_ENTRY" },
    });

    // THEN: Permission should exist in database
    expect(
      permission,
      "LOTTERY_MANUAL_ENTRY permission should exist in database",
    ).toBeDefined();
    expect(permission?.code, "Permission code should match").toBe(
      "LOTTERY_MANUAL_ENTRY",
    );
    expect(typeof permission?.code, "Permission code should be a string").toBe(
      "string",
    );
  });
});
