/**
 * Main Prisma Seed Entry Point
 *
 * Runs all seed files in order of dependency.
 * Called by `npx prisma db seed`
 */

import { PrismaClient } from "@prisma/client";
import { seedRBAC } from "../src/db/seeds/rbac.seed";
import { seedTenderTypes } from "../src/db/seeds/tender-types.seed";
import { seedDepartments } from "../src/db/seeds/departments.seed";
import { seedTaxRates } from "../src/db/seeds/tax-rates.seed";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Starting database seeding...\n");

  // 1. Seed RBAC (roles and permissions)
  console.log("Step 1: Seeding RBAC...");
  await seedRBAC();
  console.log("");

  // 2. Seed tender types
  console.log("Step 2: Seeding tender types...");
  await seedTenderTypes(prisma);
  console.log("");

  // 3. Seed departments
  console.log("Step 3: Seeding departments...");
  await seedDepartments(prisma);
  console.log("");

  // 4. Seed tax rates
  console.log("Step 4: Seeding tax rates...");
  await seedTaxRates(prisma);
  console.log("");

  console.log("✅ All seeds completed successfully!");
}

main()
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
