import { PrismaClient } from "@prisma/client";
import {
  ALL_PERMISSIONS,
  PERMISSIONS,
  PERMISSION_DESCRIPTIONS,
} from "../../constants/permissions";

const prisma = new PrismaClient();

/**
 * Seed default roles and permissions
 * Idempotent: can be run multiple times safely
 */
export async function seedRBAC() {
  console.log("Starting RBAC seed...");

  try {
    // Seed all permissions
    console.log("Seeding permissions...");
    const permissionMap = new Map<string, string>();

    for (const permissionCode of ALL_PERMISSIONS) {
      const permission = await prisma.permission.upsert({
        where: { code: permissionCode },
        update: {
          // eslint-disable-next-line security/detect-object-injection
          description: PERMISSION_DESCRIPTIONS[permissionCode],
        },
        create: {
          code: permissionCode,
          // eslint-disable-next-line security/detect-object-injection
          description: PERMISSION_DESCRIPTIONS[permissionCode],
        },
      });
      permissionMap.set(permissionCode, permission.permission_id);
    }
    console.log(`✅ Seeded ${permissionMap.size} permissions`);

    // Seed roles
    console.log("Seeding roles...");

    // SUPERADMIN - SYSTEM scope, ALL permissions
    const superadminRole = await prisma.role.upsert({
      where: { code: "SUPERADMIN" },
      update: {
        scope: "SYSTEM",
        description:
          "System administrator with full access to all resources and operations",
      },
      create: {
        code: "SUPERADMIN",
        scope: "SYSTEM",
        description:
          "System administrator with full access to all resources and operations",
      },
    });

    // CORPORATE_ADMIN - COMPANY scope
    const corporateAdminRole = await prisma.role.upsert({
      where: { code: "CORPORATE_ADMIN" },
      update: {
        scope: "COMPANY",
        description:
          "Corporate administrator with full access to company and store management",
      },
      create: {
        code: "CORPORATE_ADMIN",
        scope: "COMPANY",
        description:
          "Corporate administrator with full access to company and store management",
      },
    });

    // STORE_MANAGER - STORE scope
    const storeManagerRole = await prisma.role.upsert({
      where: { code: "STORE_MANAGER" },
      update: {
        scope: "STORE",
        description:
          "Store manager with full access to store operations and management",
      },
      create: {
        code: "STORE_MANAGER",
        scope: "STORE",
        description:
          "Store manager with full access to store operations and management",
      },
    });

    // SHIFT_MANAGER - STORE scope
    const shiftManagerRole = await prisma.role.upsert({
      where: { code: "SHIFT_MANAGER" },
      update: {
        scope: "STORE",
        description:
          "Shift manager with access to shift operations and lottery reconciliation",
      },
      create: {
        code: "SHIFT_MANAGER",
        scope: "STORE",
        description:
          "Shift manager with access to shift operations and lottery reconciliation",
      },
    });

    // CASHIER - STORE scope
    const cashierRole = await prisma.role.upsert({
      where: { code: "CASHIER" },
      update: {
        scope: "STORE",
        description:
          "Cashier with read-only access and transaction processing capabilities",
      },
      create: {
        code: "CASHIER",
        scope: "STORE",
        description:
          "Cashier with read-only access and transaction processing capabilities",
      },
    });

    // CLIENT_OWNER - COMPANY scope (owns and manages their own company and stores)
    const clientOwnerRole = await prisma.role.upsert({
      where: { code: "CLIENT_OWNER" },
      update: {
        scope: "COMPANY",
        description:
          "Client owner with full access to manage their companies, stores, and employees",
      },
      create: {
        code: "CLIENT_OWNER",
        scope: "COMPANY",
        description:
          "Client owner with full access to manage their companies, stores, and employees",
      },
    });

    // CLIENT_USER - COMPANY scope (users who can log in via client-login and access client dashboard)
    const clientUserRole = await prisma.role.upsert({
      where: { code: "CLIENT_USER" },
      update: {
        scope: "COMPANY",
        description:
          "Client user with read-only access to view owned companies and stores",
      },
      create: {
        code: "CLIENT_USER",
        scope: "COMPANY",
        description:
          "Client user with read-only access to view owned companies and stores",
      },
    });

    console.log("✅ Seeded 7 roles");

    // Map roles to permissions
    console.log("Mapping roles to permissions...");

    // SUPERADMIN: ALL permissions
    for (const permissionCode of ALL_PERMISSIONS) {
      const permissionId = permissionMap.get(permissionCode);
      if (permissionId) {
        await prisma.rolePermission.upsert({
          where: {
            role_id_permission_id: {
              role_id: superadminRole.role_id,
              permission_id: permissionId,
            },
          },
          update: {},
          create: {
            role_id: superadminRole.role_id,
            permission_id: permissionId,
          },
        });
      }
    }
    console.log("✅ SUPERADMIN: All permissions mapped");

    // CORPORATE_ADMIN: User management, store management, transactions, reports, audit view
    const corporateAdminPermissions = [
      PERMISSIONS.USER_CREATE,
      PERMISSIONS.USER_READ,
      PERMISSIONS.USER_UPDATE,
      PERMISSIONS.USER_DELETE,
      PERMISSIONS.STORE_CREATE,
      PERMISSIONS.STORE_READ,
      PERMISSIONS.STORE_UPDATE,
      PERMISSIONS.STORE_DELETE,
      PERMISSIONS.SHIFT_READ,
      PERMISSIONS.TRANSACTION_CREATE,
      PERMISSIONS.TRANSACTION_READ,
      PERMISSIONS.INVENTORY_READ,
      PERMISSIONS.INVENTORY_ORDER,
      PERMISSIONS.LOTTERY_REPORT,
      PERMISSIONS.REPORT_SHIFT,
      PERMISSIONS.REPORT_DAILY,
      PERMISSIONS.REPORT_ANALYTICS,
      PERMISSIONS.REPORT_EXPORT,
      PERMISSIONS.ADMIN_AUDIT_VIEW,
    ];

    for (const permissionCode of corporateAdminPermissions) {
      const permissionId = permissionMap.get(permissionCode);
      if (permissionId) {
        await prisma.rolePermission.upsert({
          where: {
            role_id_permission_id: {
              role_id: corporateAdminRole.role_id,
              permission_id: permissionId,
            },
          },
          update: {},
          create: {
            role_id: corporateAdminRole.role_id,
            permission_id: permissionId,
          },
        });
      }
    }
    console.log("✅ CORPORATE_ADMIN: Permissions mapped");

    // STORE_MANAGER: Store operations, shifts, transactions, inventory, lottery, reports
    // CLIENT_DASHBOARD_ACCESS allows store managers to access the client dashboard
    const storeManagerPermissions = [
      PERMISSIONS.CLIENT_DASHBOARD_ACCESS,
      PERMISSIONS.USER_READ,
      PERMISSIONS.STORE_READ,
      PERMISSIONS.STORE_UPDATE,
      PERMISSIONS.SHIFT_OPEN,
      PERMISSIONS.SHIFT_CLOSE,
      PERMISSIONS.SHIFT_READ,
      PERMISSIONS.TRANSACTION_CREATE,
      PERMISSIONS.TRANSACTION_READ,
      PERMISSIONS.INVENTORY_READ,
      PERMISSIONS.INVENTORY_ADJUST,
      PERMISSIONS.INVENTORY_ORDER,
      PERMISSIONS.LOTTERY_PACK_RECEIVE,
      PERMISSIONS.LOTTERY_SHIFT_RECONCILE,
      PERMISSIONS.LOTTERY_REPORT,
      PERMISSIONS.REPORT_SHIFT,
      PERMISSIONS.REPORT_DAILY,
      PERMISSIONS.REPORT_ANALYTICS,
      PERMISSIONS.REPORT_EXPORT,
    ];

    for (const permissionCode of storeManagerPermissions) {
      const permissionId = permissionMap.get(permissionCode);
      if (permissionId) {
        await prisma.rolePermission.upsert({
          where: {
            role_id_permission_id: {
              role_id: storeManagerRole.role_id,
              permission_id: permissionId,
            },
          },
          update: {},
          create: {
            role_id: storeManagerRole.role_id,
            permission_id: permissionId,
          },
        });
      }
    }
    console.log("✅ STORE_MANAGER: Permissions mapped");

    // SHIFT_MANAGER: Shift operations, transactions, lottery reconciliation, basic reports
    // CLIENT_DASHBOARD_ACCESS allows shift managers to access the client dashboard
    const shiftManagerPermissions = [
      PERMISSIONS.CLIENT_DASHBOARD_ACCESS,
      PERMISSIONS.SHIFT_OPEN,
      PERMISSIONS.SHIFT_CLOSE,
      PERMISSIONS.SHIFT_READ,
      PERMISSIONS.TRANSACTION_CREATE,
      PERMISSIONS.TRANSACTION_READ,
      PERMISSIONS.INVENTORY_READ,
      PERMISSIONS.LOTTERY_PACK_RECEIVE,
      PERMISSIONS.LOTTERY_SHIFT_RECONCILE,
      PERMISSIONS.LOTTERY_REPORT,
      PERMISSIONS.REPORT_SHIFT,
      PERMISSIONS.REPORT_DAILY,
    ];

    for (const permissionCode of shiftManagerPermissions) {
      const permissionId = permissionMap.get(permissionCode);
      if (permissionId) {
        await prisma.rolePermission.upsert({
          where: {
            role_id_permission_id: {
              role_id: shiftManagerRole.role_id,
              permission_id: permissionId,
            },
          },
          update: {},
          create: {
            role_id: shiftManagerRole.role_id,
            permission_id: permissionId,
          },
        });
      }
    }
    console.log("✅ SHIFT_MANAGER: Permissions mapped");

    // CASHIER: Transactions, read-only access and basic operations
    // CLIENT_DASHBOARD_ACCESS allows cashiers to access the client dashboard
    const cashierPermissions = [
      PERMISSIONS.CLIENT_DASHBOARD_ACCESS,
      PERMISSIONS.SHIFT_READ,
      PERMISSIONS.TRANSACTION_CREATE,
      PERMISSIONS.TRANSACTION_READ,
      PERMISSIONS.INVENTORY_READ,
      PERMISSIONS.LOTTERY_REPORT,
      PERMISSIONS.REPORT_SHIFT,
    ];

    for (const permissionCode of cashierPermissions) {
      const permissionId = permissionMap.get(permissionCode);
      if (permissionId) {
        await prisma.rolePermission.upsert({
          where: {
            role_id_permission_id: {
              role_id: cashierRole.role_id,
              permission_id: permissionId,
            },
          },
          update: {},
          create: {
            role_id: cashierRole.role_id,
            permission_id: permissionId,
          },
        });
      }
    }
    console.log("✅ CASHIER: Permissions mapped");

    // CLIENT_OWNER: Full access to their own companies, stores, employees, transactions, and reports
    const clientOwnerPermissions = [
      PERMISSIONS.COMPANY_CREATE,
      PERMISSIONS.COMPANY_READ,
      PERMISSIONS.COMPANY_UPDATE,
      PERMISSIONS.COMPANY_DELETE,
      PERMISSIONS.STORE_CREATE,
      PERMISSIONS.STORE_READ,
      PERMISSIONS.STORE_UPDATE,
      PERMISSIONS.STORE_DELETE,
      PERMISSIONS.USER_CREATE,
      PERMISSIONS.USER_READ,
      PERMISSIONS.USER_UPDATE,
      PERMISSIONS.USER_DELETE,
      PERMISSIONS.SHIFT_READ,
      PERMISSIONS.TRANSACTION_CREATE,
      PERMISSIONS.TRANSACTION_READ,
      PERMISSIONS.INVENTORY_READ,
      PERMISSIONS.INVENTORY_ADJUST,
      PERMISSIONS.INVENTORY_ORDER,
      PERMISSIONS.LOTTERY_REPORT,
      PERMISSIONS.REPORT_SHIFT,
      PERMISSIONS.REPORT_DAILY,
      PERMISSIONS.REPORT_ANALYTICS,
      PERMISSIONS.REPORT_EXPORT,
      // Client Dashboard and Employee Management
      PERMISSIONS.CLIENT_DASHBOARD_ACCESS,
      PERMISSIONS.CLIENT_EMPLOYEE_CREATE,
      PERMISSIONS.CLIENT_EMPLOYEE_READ,
      PERMISSIONS.CLIENT_EMPLOYEE_DELETE,
    ];

    for (const permissionCode of clientOwnerPermissions) {
      const permissionId = permissionMap.get(permissionCode);
      if (permissionId) {
        await prisma.rolePermission.upsert({
          where: {
            role_id_permission_id: {
              role_id: clientOwnerRole.role_id,
              permission_id: permissionId,
            },
          },
          update: {},
          create: {
            role_id: clientOwnerRole.role_id,
            permission_id: permissionId,
          },
        });
      }
    }
    console.log("✅ CLIENT_OWNER: Permissions mapped");

    // CLIENT_USER: Access to client dashboard, read access to owned companies/stores, and employee management
    const clientUserPermissions = [
      PERMISSIONS.CLIENT_DASHBOARD_ACCESS,
      PERMISSIONS.COMPANY_READ,
      PERMISSIONS.STORE_READ,
      PERMISSIONS.SHIFT_READ,
      PERMISSIONS.TRANSACTION_READ,
      PERMISSIONS.INVENTORY_READ,
      PERMISSIONS.LOTTERY_REPORT,
      PERMISSIONS.REPORT_SHIFT,
      PERMISSIONS.REPORT_DAILY,
      PERMISSIONS.REPORT_ANALYTICS,
      // Client Employee Management
      PERMISSIONS.CLIENT_EMPLOYEE_CREATE,
      PERMISSIONS.CLIENT_EMPLOYEE_READ,
      PERMISSIONS.CLIENT_EMPLOYEE_DELETE,
    ];

    for (const permissionCode of clientUserPermissions) {
      const permissionId = permissionMap.get(permissionCode);
      if (permissionId) {
        await prisma.rolePermission.upsert({
          where: {
            role_id_permission_id: {
              role_id: clientUserRole.role_id,
              permission_id: permissionId,
            },
          },
          update: {},
          create: {
            role_id: clientUserRole.role_id,
            permission_id: permissionId,
          },
        });
      }
    }
    console.log("✅ CLIENT_USER: Permissions mapped");

    console.log("✅ RBAC seed completed successfully");
  } catch (error) {
    console.error("❌ Error seeding RBAC:", error);
    throw error;
  }
}

// Run seed if called directly
if (require.main === module) {
  seedRBAC()
    .then(() => {
      console.log("Seed completed");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Seed failed:", error);
      process.exit(1);
    })
    .finally(() => {
      prisma.$disconnect();
    });
}
