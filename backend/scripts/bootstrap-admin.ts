/**
 * Bootstrap Admin Script
 *
 * Creates the first superadmin user for the system.
 * This script should be run once after initial database setup.
 *
 * Usage:
 *   npx ts-node scripts/bootstrap-admin.ts
 *
 * Or add to package.json:
 *   "bootstrap:admin": "ts-node scripts/bootstrap-admin.ts"
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { generatePublicId, PUBLIC_ID_PREFIXES } from "../src/utils/public-id";

const prisma = new PrismaClient();

// Configuration - Change these values for your admin user
const ADMIN_CONFIG = {
  email: "admin@nuvana.com",
  name: "System Administrator",
  password: "Admin123!", // Change this in production!
};

async function main() {
  console.log("🚀 Bootstrap Admin Script\n");

  try {
    // 1. Check if admin user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: ADMIN_CONFIG.email },
    });

    if (existingUser) {
      console.log(`⚠️  User with email ${ADMIN_CONFIG.email} already exists.`);
      console.log(`   User ID: ${existingUser.user_id}`);

      // Check if they have SUPERADMIN role
      const existingRole = await prisma.userRole.findFirst({
        where: {
          user_id: existingUser.user_id,
          role: {
            code: "SUPERADMIN",
          },
        },
      });

      if (existingRole) {
        console.log("   ✓ User already has SUPERADMIN role");
      } else {
        console.log("   ⚠️  User does not have SUPERADMIN role");
      }

      return;
    }

    // 2. Check if SUPERADMIN role exists
    let superadminRole = await prisma.role.findUnique({
      where: { code: "SUPERADMIN" },
    });

    if (!superadminRole) {
      console.log("⚠️  SUPERADMIN role not found. Creating it...");

      // Create SUPERADMIN role
      superadminRole = await prisma.role.create({
        data: {
          code: "SUPERADMIN",
          scope: "SYSTEM",
          description: "System administrator with full access",
        },
      });

      console.log(`   ✓ Created SUPERADMIN role: ${superadminRole.role_id}`);

      // Get all permissions and assign them to SUPERADMIN
      const allPermissions = await prisma.permission.findMany();

      if (allPermissions.length > 0) {
        await prisma.rolePermission.createMany({
          data: allPermissions.map((p) => ({
            role_id: superadminRole!.role_id,
            permission_id: p.permission_id,
          })),
        });
        console.log(
          `   ✓ Assigned ${allPermissions.length} permissions to SUPERADMIN`,
        );
      } else {
        console.log("   ⚠️  No permissions found. Run RBAC seed script first.");
      }
    } else {
      console.log(`✓ SUPERADMIN role exists: ${superadminRole.role_id}`);
    }

    // 3. Hash password
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(ADMIN_CONFIG.password, saltRounds);

    // 4. Create admin user
    const adminUser = await prisma.user.create({
      data: {
        public_id: generatePublicId(PUBLIC_ID_PREFIXES.USER),
        email: ADMIN_CONFIG.email,
        name: ADMIN_CONFIG.name,
        password_hash: passwordHash,
        status: "ACTIVE",
      },
    });

    console.log(`\n✓ Created admin user:`);
    console.log(`   ID: ${adminUser.user_id}`);
    console.log(`   Email: ${adminUser.email}`);
    console.log(`   Name: ${adminUser.name}`);

    // 5. Assign SUPERADMIN role
    const userRole = await prisma.userRole.create({
      data: {
        user_id: adminUser.user_id,
        role_id: superadminRole.role_id,
      },
    });

    console.log(`\n✓ Assigned SUPERADMIN role:`);
    console.log(`   UserRole ID: ${userRole.user_role_id}`);

    // 6. Print login credentials
    console.log("\n" + "=".repeat(50));
    console.log("🔐 ADMIN LOGIN CREDENTIALS");
    console.log("=".repeat(50));
    console.log(`   Email:    ${ADMIN_CONFIG.email}`);
    console.log(`   Password: ${ADMIN_CONFIG.password}`);
    console.log("=".repeat(50));
    console.log("\n⚠️  IMPORTANT: Change this password after first login!\n");
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
