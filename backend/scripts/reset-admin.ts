/**
 * Reset Admin Script
 *
 * Recreates the superadmin user, deleting if exists first.
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { generatePublicId, PUBLIC_ID_PREFIXES } from "../src/utils/public-id";

const prisma = new PrismaClient();

const ADMIN_CONFIG = {
  email: "admin@nuvana.com",
  name: "Super Admin",
  password: "Admin123!",
};

async function main() {
  console.log("🔄 Reset Admin Script\n");

  try {
    // 1. Delete existing admin if exists
    const existingUser = await prisma.user.findUnique({
      where: { email: ADMIN_CONFIG.email },
    });

    if (existingUser) {
      console.log(`Found existing user, removing...`);

      // Delete user roles first
      await prisma.userRole.deleteMany({
        where: { user_id: existingUser.user_id },
      });

      // Delete user
      await prisma.user.delete({
        where: { user_id: existingUser.user_id },
      });

      console.log(`   ✓ Deleted existing admin user`);
    }

    // 2. Get SUPERADMIN role
    const superadminRole = await prisma.role.findUnique({
      where: { code: "SUPERADMIN" },
    });

    if (!superadminRole) {
      console.error("❌ SUPERADMIN role not found. Run RBAC seed first.");
      process.exit(1);
    }

    // 3. Hash password
    const passwordHash = await bcrypt.hash(ADMIN_CONFIG.password, 12);

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

    console.log(`✓ Created admin user: ${adminUser.user_id}`);

    // 5. Assign SUPERADMIN role
    await prisma.userRole.create({
      data: {
        user_id: adminUser.user_id,
        role_id: superadminRole.role_id,
      },
    });

    console.log(`✓ Assigned SUPERADMIN role`);

    console.log("\n" + "=".repeat(50));
    console.log("🔐 ADMIN LOGIN CREDENTIALS");
    console.log("=".repeat(50));
    console.log(`   Email:    ${ADMIN_CONFIG.email}`);
    console.log(`   Password: ${ADMIN_CONFIG.password}`);
    console.log("=".repeat(50) + "\n");
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
