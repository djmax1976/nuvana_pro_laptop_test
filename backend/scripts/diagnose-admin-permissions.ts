/**
 * Diagnostic Script: Check Super Admin Permissions
 *
 * This script checks:
 * 1. If the super admin user exists
 * 2. If they have the SUPERADMIN role assigned
 * 3. If the SUPERADMIN role has ADMIN_SYSTEM_CONFIG permission
 * 4. What permissions the user should have
 *
 * Usage:
 *   npx ts-node backend/scripts/diagnose-admin-permissions.ts
 */

import { PrismaClient } from "@prisma/client";
import { withRLSTransaction } from "../src/utils/db";

const prisma = new PrismaClient();

const ADMIN_EMAIL = "admin@nuvana.com";

async function main() {
  console.log("🔍 Diagnosing Super Admin Permissions\n");
  console.log("=".repeat(60));

  try {
    // 1. Check if admin user exists
    console.log("\n1. Checking if admin user exists...");
    const adminUser = await prisma.user.findUnique({
      where: { email: ADMIN_EMAIL },
    });

    if (!adminUser) {
      console.log("❌ Admin user NOT FOUND in database!");
      console.log(`   Email: ${ADMIN_EMAIL}`);
      console.log(
        "\n   SOLUTION: Run bootstrap-admin.ts to create the admin user",
      );
      return;
    }

    console.log("✅ Admin user found:");
    console.log(`   User ID: ${adminUser.user_id}`);
    console.log(`   Email: ${adminUser.email}`);
    console.log(`   Name: ${adminUser.name}`);
    console.log(`   Status: ${adminUser.status}`);

    // 2. Check if SUPERADMIN role exists
    console.log("\n2. Checking if SUPERADMIN role exists...");
    const superadminRole = await prisma.role.findUnique({
      where: { code: "SUPERADMIN" },
    });

    if (!superadminRole) {
      console.log("❌ SUPERADMIN role NOT FOUND in database!");
      console.log("\n   SOLUTION: Run RBAC seed script to create roles");
      return;
    }

    console.log("✅ SUPERADMIN role found:");
    console.log(`   Role ID: ${superadminRole.role_id}`);
    console.log(`   Code: ${superadminRole.code}`);
    console.log(`   Scope: ${superadminRole.scope}`);

    // 3. Check if user has SUPERADMIN role assigned (WITHOUT RLS to see actual state)
    console.log("\n3. Checking user role assignments (bypassing RLS)...");
    const userRoles = await prisma.userRole.findMany({
      where: { user_id: adminUser.user_id },
      include: {
        role: true,
      },
    });

    console.log(`   Found ${userRoles.length} role assignment(s):`);
    if (userRoles.length === 0) {
      console.log("   ❌ CRITICAL: User has NO roles assigned!");
      console.log(
        "\n   SOLUTION: Run bootstrap-admin.ts or manually assign SUPERADMIN role",
      );
    } else {
      userRoles.forEach((ur) => {
        console.log(`   - ${ur.role.code} (${ur.role.scope})`);
      });
    }

    const hasSuperadminRole = userRoles.some(
      (ur) => ur.role.code === "SUPERADMIN",
    );
    if (!hasSuperadminRole) {
      console.log("\n   ❌ CRITICAL: User does NOT have SUPERADMIN role!");
      console.log("\n   SOLUTION: Assign SUPERADMIN role to user");
    }

    // 4. Check SUPERADMIN role permissions
    console.log("\n4. Checking SUPERADMIN role permissions...");
    const rolePermissions = await prisma.rolePermission.findMany({
      where: { role_id: superadminRole.role_id },
      include: {
        permission: true,
      },
    });

    console.log(`   SUPERADMIN has ${rolePermissions.length} permission(s):`);
    const permissionCodes = rolePermissions.map((rp) => rp.permission.code);
    const hasAdminPermission = permissionCodes.includes("ADMIN_SYSTEM_CONFIG");

    if (hasAdminPermission) {
      console.log("   ✅ ADMIN_SYSTEM_CONFIG permission found");
    } else {
      console.log("   ❌ ADMIN_SYSTEM_CONFIG permission NOT found!");
      console.log("\n   SOLUTION: Run RBAC seed script to assign permissions");
    }

    console.log("\n   All permissions:");
    permissionCodes.slice(0, 10).forEach((code) => {
      console.log(`     - ${code}`);
    });
    if (permissionCodes.length > 10) {
      console.log(`     ... and ${permissionCodes.length - 10} more`);
    }

    // 5. Test RLS query (simulating what happens during login)
    console.log(
      "\n5. Testing RLS query (simulating login token generation)...",
    );
    try {
      const userRolesWithRLS = await withRLSTransaction(
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

      console.log(
        `   ✅ RLS query returned ${userRolesWithRLS.length} role(s)`,
      );
      if (userRolesWithRLS.length > 0) {
        const allPermissions = new Set<string>();
        userRolesWithRLS.forEach((ur) => {
          ur.role.role_permissions.forEach((rp) => {
            allPermissions.add(rp.permission.code);
          });
        });

        console.log(
          `   ✅ Found ${allPermissions.size} total permission(s) via RLS`,
        );
        console.log(
          `   ✅ ADMIN_SYSTEM_CONFIG: ${allPermissions.has("ADMIN_SYSTEM_CONFIG") ? "YES" : "NO"}`,
        );

        if (!allPermissions.has("ADMIN_SYSTEM_CONFIG")) {
          console.log(
            "\n   ❌ CRITICAL: RLS query does NOT return ADMIN_SYSTEM_CONFIG!",
          );
          console.log(
            "   This means JWT tokens will be generated WITHOUT this permission.",
          );
        }
      } else {
        console.log("   ❌ CRITICAL: RLS query returned ZERO roles!");
        console.log(
          "   This means JWT tokens will be generated with EMPTY permissions.",
        );
        console.log("\n   POSSIBLE CAUSES:");
        console.log(
          "   1. RLS policy is blocking the query (check app.current_user_id is set)",
        );
        console.log(
          "   2. User roles were not created with proper RLS context",
        );
      }
    } catch (error) {
      console.log("   ❌ RLS query FAILED:");
      console.error("   ", error);
    }

    // 6. Summary and recommendations
    console.log("\n" + "=".repeat(60));
    console.log("📋 SUMMARY");
    console.log("=".repeat(60));

    if (
      adminUser &&
      hasSuperadminRole &&
      hasAdminPermission &&
      userRoles.length > 0
    ) {
      console.log("\n✅ Database setup looks correct!");
      console.log("\n⚠️  If you're still getting 'unauthorized' errors:");
      console.log("   1. The JWT token was generated BEFORE the fix");
      console.log("   2. You need to LOG OUT and LOG BACK IN");
      console.log(
        "   3. This will generate a new JWT token with correct permissions",
      );
    } else {
      console.log("\n❌ Database setup has issues:");
      if (!hasSuperadminRole) {
        console.log("   - User does not have SUPERADMIN role assigned");
      }
      if (!hasAdminPermission) {
        console.log(
          "   - SUPERADMIN role does not have ADMIN_SYSTEM_CONFIG permission",
        );
      }
      if (userRoles.length === 0) {
        console.log("   - User has no roles assigned at all");
      }
      console.log("\n   SOLUTION: Run the following scripts:");
      console.log("   1. npm run seed:rbac (in backend directory)");
      console.log("   2. npx ts-node backend/scripts/bootstrap-admin.ts");
    }
  } catch (error) {
    console.error("\n❌ Error:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
