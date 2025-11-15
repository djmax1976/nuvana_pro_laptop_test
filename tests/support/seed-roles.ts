/**
 * Seed roles for testing
 * Run this before tests to ensure required roles exist
 */
import { PrismaClient } from "../../backend/node_modules/@prisma/client/index.js";

const prisma = new PrismaClient();

async function seedRoles() {
  // Seed Permissions first
  const permissions = [
    {
      code: "ADMIN_SYSTEM_CONFIG",
      description: "System administration and configuration",
    },
    { code: "USER_READ", description: "Read user data" },
    { code: "STORE_CREATE", description: "Create stores" },
    { code: "STORE_READ", description: "Read store data" },
    { code: "SHIFT_OPEN", description: "Open shifts" },
    { code: "SHIFT_CLOSE", description: "Close shifts" },
    { code: "INVENTORY_READ", description: "Read inventory data" },
  ];

  const createdPermissions: Record<string, any> = {};
  for (const permData of permissions) {
    const perm = await prisma.permission.upsert({
      where: { code: permData.code },
      update: permData,
      create: permData,
    });
    createdPermissions[permData.code] = perm;
  }

  // Seed Roles
  const roles = [
    {
      code: "SUPERADMIN",
      scope: "SYSTEM",
      description: "System super administrator with all permissions",
    },
    {
      code: "CORPORATE_ADMIN",
      scope: "COMPANY",
      description: "Corporate administrator for company-level operations",
    },
    {
      code: "STORE_MANAGER",
      scope: "STORE",
      description: "Store manager for store-level operations",
    },
  ];

  const createdRoles: Record<string, any> = {};
  for (const roleData of roles) {
    const role = await prisma.role.upsert({
      where: { code: roleData.code },
      update: roleData,
      create: roleData,
    });
    createdRoles[roleData.code] = role;
  }

  // Seed Role-Permission mappings
  const rolePermissions = [
    // SUPERADMIN gets all permissions
    { role: "SUPERADMIN", permission: "ADMIN_SYSTEM_CONFIG" },
    { role: "SUPERADMIN", permission: "USER_READ" },
    { role: "SUPERADMIN", permission: "STORE_CREATE" },
    { role: "SUPERADMIN", permission: "STORE_READ" },
    { role: "SUPERADMIN", permission: "SHIFT_OPEN" },
    { role: "SUPERADMIN", permission: "SHIFT_CLOSE" },
    { role: "SUPERADMIN", permission: "INVENTORY_READ" },
    // CORPORATE_ADMIN gets company-level permissions
    { role: "CORPORATE_ADMIN", permission: "USER_READ" },
    { role: "CORPORATE_ADMIN", permission: "STORE_CREATE" },
    { role: "CORPORATE_ADMIN", permission: "STORE_READ" },
    // STORE_MANAGER gets store-level permissions
    { role: "STORE_MANAGER", permission: "SHIFT_OPEN" },
    { role: "STORE_MANAGER", permission: "SHIFT_CLOSE" },
    { role: "STORE_MANAGER", permission: "INVENTORY_READ" },
  ];

  for (const rp of rolePermissions) {
    const role = createdRoles[rp.role];
    const permission = createdPermissions[rp.permission];

    if (role && permission) {
      await prisma.rolePermission.upsert({
        where: {
          role_id_permission_id: {
            role_id: role.role_id,
            permission_id: permission.permission_id,
          },
        },
        update: {},
        create: {
          role_id: role.role_id,
          permission_id: permission.permission_id,
        },
      });
    }
  }

  console.log(
    "✅ Roles, permissions, and role-permissions seeded successfully",
  );
}

seedRoles()
  .catch((e) => {
    console.error("❌ Error seeding roles:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
