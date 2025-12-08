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
        is_system_role: true,
      },
      create: {
        code: "SUPERADMIN",
        scope: "SYSTEM",
        description:
          "System administrator with full access to all resources and operations",
        is_system_role: true,
      },
    });

    // CORPORATE_ADMIN - COMPANY scope
    const corporateAdminRole = await prisma.role.upsert({
      where: { code: "CORPORATE_ADMIN" },
      update: {
        scope: "COMPANY",
        description:
          "Corporate administrator with full access to company and store management",
        is_system_role: true,
      },
      create: {
        code: "CORPORATE_ADMIN",
        scope: "COMPANY",
        description:
          "Corporate administrator with full access to company and store management",
        is_system_role: true,
      },
    });

    // STORE_MANAGER - STORE scope
    const storeManagerRole = await prisma.role.upsert({
      where: { code: "STORE_MANAGER" },
      update: {
        scope: "STORE",
        description:
          "Store manager with full access to store operations and management",
        is_system_role: true,
      },
      create: {
        code: "STORE_MANAGER",
        scope: "STORE",
        description:
          "Store manager with full access to store operations and management",
        is_system_role: true,
      },
    });

    // SHIFT_MANAGER - STORE scope
    const shiftManagerRole = await prisma.role.upsert({
      where: { code: "SHIFT_MANAGER" },
      update: {
        scope: "STORE",
        description:
          "Shift manager with access to shift operations and lottery reconciliation",
        is_system_role: true,
      },
      create: {
        code: "SHIFT_MANAGER",
        scope: "STORE",
        description:
          "Shift manager with access to shift operations and lottery reconciliation",
        is_system_role: true,
      },
    });

    // CLIENT_OWNER - COMPANY scope (owns and manages their own company and stores)
    const clientOwnerRole = await prisma.role.upsert({
      where: { code: "CLIENT_OWNER" },
      update: {
        scope: "COMPANY",
        description:
          "Client owner with full access to manage their companies, stores, and employees",
        is_system_role: true,
      },
      create: {
        code: "CLIENT_OWNER",
        scope: "COMPANY",
        description:
          "Client owner with full access to manage their companies, stores, and employees",
        is_system_role: true,
      },
    });

    // CLIENT_USER - STORE scope (store login credential for physical terminal authentication)
    // This is a machine/location credential that authenticates a physical device at a specific store.
    // It grants access ONLY to the assigned store's MyStore Dashboard - never cross-store access.
    // Individual cashiers then use their CASHIER role to start/end shifts on that terminal.
    const clientUserRole = await prisma.role.upsert({
      where: { code: "CLIENT_USER" },
      update: {
        scope: "STORE",
        description:
          "Store login credential for physical terminal authentication - grants access only to assigned store's dashboard",
        is_system_role: true,
      },
      create: {
        code: "CLIENT_USER",
        scope: "STORE",
        description:
          "Store login credential for physical terminal authentication - grants access only to assigned store's dashboard",
        is_system_role: true,
      },
    });

    // CASHIER - STORE scope (cashiers who operate terminals, start/end shifts, and handle transactions)
    const cashierRole = await prisma.role.upsert({
      where: { code: "CASHIER" },
      update: {
        scope: "STORE",
        description:
          "Cashier with access to start/end shifts, process transactions, and view shift reports at assigned stores",
        is_system_role: true,
      },
      create: {
        code: "CASHIER",
        scope: "STORE",
        description:
          "Cashier with access to start/end shifts, process transactions, and view shift reports at assigned stores",
        is_system_role: true,
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
      PERMISSIONS.CLIENT_EMPLOYEE_CREATE,
      PERMISSIONS.CLIENT_EMPLOYEE_READ,
      PERMISSIONS.CLIENT_EMPLOYEE_DELETE,
      PERMISSIONS.USER_READ,
      PERMISSIONS.STORE_READ,
      PERMISSIONS.STORE_UPDATE,
      PERMISSIONS.SHIFT_OPEN,
      PERMISSIONS.SHIFT_CLOSE,
      PERMISSIONS.SHIFT_READ,
      PERMISSIONS.SHIFT_REPORT_VIEW,
      PERMISSIONS.TRANSACTION_CREATE,
      PERMISSIONS.TRANSACTION_READ,
      PERMISSIONS.INVENTORY_READ,
      PERMISSIONS.INVENTORY_ADJUST,
      PERMISSIONS.INVENTORY_ORDER,
      // Lottery - Full read access and operational permissions
      PERMISSIONS.LOTTERY_GAME_READ,
      PERMISSIONS.LOTTERY_PACK_READ,
      PERMISSIONS.LOTTERY_PACK_RECEIVE,
      PERMISSIONS.LOTTERY_PACK_ACTIVATE,
      PERMISSIONS.LOTTERY_VARIANCE_READ,
      PERMISSIONS.LOTTERY_BIN_READ,
      PERMISSIONS.LOTTERY_BIN_MANAGE,
      PERMISSIONS.LOTTERY_BIN_CONFIG_READ,
      PERMISSIONS.LOTTERY_BIN_CONFIG_WRITE,
      PERMISSIONS.LOTTERY_SHIFT_OPEN,
      PERMISSIONS.LOTTERY_SHIFT_CLOSE,
      PERMISSIONS.LOTTERY_SHIFT_RECONCILE,
      PERMISSIONS.LOTTERY_REPORT,
      PERMISSIONS.REPORT_SHIFT,
      PERMISSIONS.REPORT_DAILY,
      PERMISSIONS.REPORT_ANALYTICS,
      PERMISSIONS.REPORT_EXPORT,
      // Cashier Management
      PERMISSIONS.CASHIER_CREATE,
      PERMISSIONS.CASHIER_READ,
      PERMISSIONS.CASHIER_UPDATE,
      PERMISSIONS.CASHIER_DELETE,
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
    // CLIENT_EMPLOYEE_READ allows viewing employees (read-only for shift managers)
    const shiftManagerPermissions = [
      PERMISSIONS.CLIENT_DASHBOARD_ACCESS,
      PERMISSIONS.CLIENT_EMPLOYEE_READ,
      PERMISSIONS.SHIFT_OPEN,
      PERMISSIONS.SHIFT_CLOSE,
      PERMISSIONS.SHIFT_READ,
      PERMISSIONS.SHIFT_RECONCILE,
      PERMISSIONS.TRANSACTION_CREATE,
      PERMISSIONS.TRANSACTION_READ,
      PERMISSIONS.INVENTORY_READ,
      PERMISSIONS.LOTTERY_PACK_RECEIVE,
      PERMISSIONS.LOTTERY_SHIFT_RECONCILE,
      PERMISSIONS.LOTTERY_REPORT,
      PERMISSIONS.REPORT_SHIFT,
      PERMISSIONS.REPORT_DAILY,
      // Cashier Management (read-only for shift managers to view cashiers)
      PERMISSIONS.CASHIER_READ,
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

    // CLIENT_OWNER: Full access to ALL company and store scope operations
    // This includes everything EXCEPT system-level admin permissions (ADMIN_*)
    const clientOwnerPermissions = [
      // Company Management (COMPANY scope)
      PERMISSIONS.COMPANY_CREATE,
      PERMISSIONS.COMPANY_READ,
      PERMISSIONS.COMPANY_UPDATE,
      PERMISSIONS.COMPANY_DELETE,

      // Store Management (STORE scope)
      PERMISSIONS.STORE_CREATE,
      PERMISSIONS.STORE_READ,
      PERMISSIONS.STORE_UPDATE,
      PERMISSIONS.STORE_DELETE,

      // User Management (for their company/stores)
      PERMISSIONS.USER_CREATE,
      PERMISSIONS.USER_READ,
      PERMISSIONS.USER_UPDATE,
      PERMISSIONS.USER_DELETE,

      // Shift Operations (STORE scope)
      PERMISSIONS.SHIFT_OPEN,
      PERMISSIONS.SHIFT_CLOSE,
      PERMISSIONS.SHIFT_READ,
      PERMISSIONS.SHIFT_RECONCILE,
      PERMISSIONS.SHIFT_REPORT_VIEW,

      // Transaction Management (STORE scope)
      PERMISSIONS.TRANSACTION_CREATE,
      PERMISSIONS.TRANSACTION_READ,
      PERMISSIONS.TRANSACTION_IMPORT,

      // Inventory Management (STORE scope)
      PERMISSIONS.INVENTORY_READ,
      PERMISSIONS.INVENTORY_ADJUST,
      PERMISSIONS.INVENTORY_ORDER,

      // Lottery Management (STORE scope) - Full access including reads
      PERMISSIONS.LOTTERY_GAME_READ,
      PERMISSIONS.LOTTERY_PACK_READ,
      PERMISSIONS.LOTTERY_PACK_RECEIVE,
      PERMISSIONS.LOTTERY_PACK_ACTIVATE,
      PERMISSIONS.LOTTERY_VARIANCE_READ,
      PERMISSIONS.LOTTERY_BIN_READ,
      PERMISSIONS.LOTTERY_SHIFT_OPEN,
      PERMISSIONS.LOTTERY_SHIFT_CLOSE,
      PERMISSIONS.LOTTERY_SHIFT_RECONCILE,
      PERMISSIONS.LOTTERY_REPORT,

      // Reports (COMPANY/STORE scope)
      PERMISSIONS.REPORT_SHIFT,
      PERMISSIONS.REPORT_DAILY,
      PERMISSIONS.REPORT_ANALYTICS,
      PERMISSIONS.REPORT_EXPORT,

      // Client Dashboard Access
      PERMISSIONS.CLIENT_DASHBOARD_ACCESS,

      // Client Employee Management
      PERMISSIONS.CLIENT_EMPLOYEE_CREATE,
      PERMISSIONS.CLIENT_EMPLOYEE_READ,
      PERMISSIONS.CLIENT_EMPLOYEE_DELETE,

      // Cashier Management (STORE scope)
      PERMISSIONS.CASHIER_CREATE,
      PERMISSIONS.CASHIER_READ,
      PERMISSIONS.CASHIER_UPDATE,
      PERMISSIONS.CASHIER_DELETE,

      // Client Role Management (owner can manage roles for their stores)
      PERMISSIONS.CLIENT_ROLE_MANAGE,
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
      // Cashier Management (read-only for client users to view cashiers at terminals)
      PERMISSIONS.CASHIER_READ,
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

    // CASHIER: Shift operations and transaction processing for cashiers at terminals
    // Cashiers can start/end shifts, process transactions, and view their shift reports
    const cashierPermissions = [
      PERMISSIONS.CLIENT_DASHBOARD_ACCESS,
      // Shift Operations - CASHIER can open and close their own shifts
      PERMISSIONS.SHIFT_OPEN,
      PERMISSIONS.SHIFT_CLOSE,
      PERMISSIONS.SHIFT_READ,
      // Transaction Operations
      PERMISSIONS.TRANSACTION_CREATE,
      PERMISSIONS.TRANSACTION_READ,
      // Reports
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
