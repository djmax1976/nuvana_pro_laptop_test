/**
 * Fix Admin Permissions Script
 *
 * This script ensures the super admin user has:
 * 1. The SUPERADMIN role assigned
 * 2. The SUPERADMIN role has all permissions including ADMIN_SYSTEM_CONFIG
 *
 * Usage:
 *   npx ts-node backend/scripts/fix-admin-permissions.ts
 */

import { PrismaClient } from "@prisma/client";
import { withRLSTransaction } from "../src/utils/db";
import { ALL_PERMISSIONS } from "../src/constants/permissions";

const prisma = new PrismaClient();

const ADMIN_EMAIL = "admin@nuvana.com";

async function main() {
  console.log("🔧 Fixing Super Admin Permissions\n");
  console.log("=".repeat(60));

  try {
    // 1. Find admin user
    const adminUser = await prisma.user.findUnique({
      where: { email: ADMIN_EMAIL },
    });

    if (!adminUser) {
      console.log(`❌ Admin user not found: ${ADMIN_EMAIL}`);
      console.log("   Run bootstrap-admin.ts first to create the user");
      process.exit(1);
    }

    console.log(`✅ Found admin user: ${adminUser.user_id}`);

    // 2. Get or create SUPERADMIN role
    let superadminRole = await prisma.role.findUnique({
      where: { code: "SUPERADMIN" },
    });

    if (!superadminRole) {
      console.log("⚠️  SUPERADMIN role not found. Creating...");
      superadminRole = await prisma.role.create({
        data: {
          code: "SUPERADMIN",
          scope: "SYSTEM",
          description:
            "System administrator with full access to all resources and operations",
          is_system_role: true,
        },
      });
      console.log(`✅ Created SUPERADMIN role: ${superadminRole.role_id}`);
    } else {
      console.log(`✅ SUPERADMIN role exists: ${superadminRole.role_id}`);
    }

    // 3. Ensure all permissions exist and are assigned to SUPERADMIN
    console.log("\n3. Ensuring all permissions are assigned to SUPERADMIN...");
    const permissionMap = new Map<string, string>();

    for (const permissionCode of ALL_PERMISSIONS) {
      const permission = await prisma.permission.upsert({
        where: { code: permissionCode },
        update: {},
        create: {
          code: permissionCode,
          description: `Permission: ${permissionCode}`,
        },
      });
      permissionMap.set(permissionCode, permission.permission_id);
    }

    console.log(`   Found ${permissionMap.size} permissions`);

    // Assign all permissions to SUPERADMIN
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

    console.log(
      `✅ Assigned ${ALL_PERMISSIONS.length} permissions to SUPERADMIN`,
    );

    // 4. Check if user has SUPERADMIN role
    console.log("\n4. Checking user role assignment...");
    const existingUserRole = await prisma.userRole.findFirst({
      where: {
        user_id: adminUser.user_id,
        role_id: superadminRole.role_id,
      },
    });

    if (existingUserRole) {
      console.log("✅ User already has SUPERADMIN role assigned");
    } else {
      console.log("⚠️  User does NOT have SUPERADMIN role. Assigning...");

      // Use RLS transaction to ensure proper context
      await withRLSTransaction(adminUser.user_id, async (tx) => {
        await tx.userRole.create({
          data: {
            user_id: adminUser.user_id,
            role_id: superadminRole.role_id,
          },
        });
      });

      console.log("✅ Assigned SUPERADMIN role to user");
    }

    // 5. Verify the fix by querying with RLS
    console.log("\n5. Verifying fix with RLS query...");
    const userRoles = await withRLSTransaction(
      adminUser.user_id,
      async (tx) => {
        return await tx.userRole.findMany({
          where: { user_id: adminUser.user_id },
          include: {
            role: {
              include: {
                role_permissions: {
                  include: {
                    permission: true,
                  },
                },
              },
            },
          },
        });
      },
    );

    if (userRoles.length === 0) {
      console.log(
        "❌ CRITICAL: RLS query returned ZERO roles! RLS policy is blocking access.",
      );
      console.log(
        "\n   This means the user_roles table RLS policy is preventing the query.",
      );
      console.log(
        "   The policy should allow: user_id::text = current_setting('app.current_user_id', true)",
      );
    } else {
      console.log(`✅ RLS query returned ${userRoles.length} role(s)`);

      const allPermissions = new Set<string>();
      userRoles.forEach((ur) => {
        ur.role.role_permissions.forEach((rp) => {
          allPermissions.add(rp.permission.code);
        });
      });

      console.log(
        `✅ Found ${allPermissions.size} permission(s) via RLS query`,
      );
      console.log(
        `✅ ADMIN_SYSTEM_CONFIG: ${allPermissions.has("ADMIN_SYSTEM_CONFIG") ? "YES ✅" : "NO ❌"}`,
      );

      if (allPermissions.has("ADMIN_SYSTEM_CONFIG")) {
        console.log(
          "\n✅ SUCCESS! User should now be able to access roles page after logging out and back in.",
        );
      } else {
        console.log(
          "\n❌ ADMIN_SYSTEM_CONFIG permission still missing from RLS query results.",
        );
        console.log("   This indicates an RLS policy issue.");
      }
    }

    console.log("\n" + "=".repeat(60));
    console.log("📋 NEXT STEPS");
    console.log("=".repeat(60));
    console.log("1. Have the super admin LOG OUT completely");
    console.log("2. Have them LOG BACK IN");
    console.log(
      "3. This will generate a new JWT token with correct permissions",
    );
    console.log("4. They should now be able to access the roles page");
  } catch (error) {
    console.error("\n❌ Error:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
