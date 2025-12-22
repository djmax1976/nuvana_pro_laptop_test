/**
 * Department Seed Data
 *
 * Seeds the default system departments (product categories).
 * These are system-defined and cannot be deleted by clients.
 * Phase 1.2: Shift & Day Summary Implementation Plan
 */

// NOTE: Do NOT load dotenv here - DATABASE_URL comes from the environment
// This seed is called from seed.ts which passes the prisma client

import { PrismaClient, Prisma } from "@prisma/client";

/**
 * System default departments
 * These have client_id = null (system-wide) and is_system = true
 */
const SYSTEM_DEPARTMENTS: Omit<
  Prisma.DepartmentCreateInput,
  "client" | "created_by_user" | "parent" | "children"
>[] = [
  {
    code: "GROCERY",
    display_name: "Grocery",
    description: "General grocery items",
    is_taxable: true,
    minimum_age: null,
    requires_id_scan: false,
    is_lottery: false,
    sort_order: 1,
    icon_name: "shopping-bag",
    color_code: "#22c55e",
    is_system: true,
    is_active: true,
    level: 1,
  },
  {
    code: "TOBACCO",
    display_name: "Tobacco Products",
    description: "Cigarettes, cigars, and tobacco products",
    is_taxable: true,
    minimum_age: 21,
    requires_id_scan: true,
    is_lottery: false,
    sort_order: 2,
    icon_name: "cigarette",
    color_code: "#78716c",
    is_system: true,
    is_active: true,
    level: 1,
  },
  {
    code: "ALCOHOL",
    display_name: "Beer & Wine",
    description: "Alcoholic beverages",
    is_taxable: true,
    minimum_age: 21,
    requires_id_scan: true,
    is_lottery: false,
    sort_order: 3,
    icon_name: "wine",
    color_code: "#7c3aed",
    is_system: true,
    is_active: true,
    level: 1,
  },
  {
    code: "LOTTERY",
    display_name: "Lottery",
    description: "Lottery tickets and scratch-offs",
    is_taxable: false,
    minimum_age: 18,
    requires_id_scan: false,
    is_lottery: true,
    sort_order: 4,
    icon_name: "ticket",
    color_code: "#f59e0b",
    is_system: true,
    is_active: true,
    level: 1,
  },
  {
    code: "FUEL",
    display_name: "Fuel",
    description: "Gasoline and diesel",
    is_taxable: true,
    minimum_age: null,
    requires_id_scan: false,
    is_lottery: false,
    sort_order: 5,
    icon_name: "fuel",
    color_code: "#ef4444",
    is_system: true,
    is_active: true,
    level: 1,
  },
  {
    code: "BEVERAGES",
    display_name: "Beverages",
    description: "Non-alcoholic drinks",
    is_taxable: true,
    minimum_age: null,
    requires_id_scan: false,
    is_lottery: false,
    sort_order: 6,
    icon_name: "cup-soda",
    color_code: "#3b82f6",
    is_system: true,
    is_active: true,
    level: 1,
  },
  {
    code: "SNACKS",
    display_name: "Snacks & Candy",
    description: "Snack foods and confectionery",
    is_taxable: true,
    minimum_age: null,
    requires_id_scan: false,
    is_lottery: false,
    sort_order: 7,
    icon_name: "candy",
    color_code: "#ec4899",
    is_system: true,
    is_active: true,
    level: 1,
  },
  {
    code: "DAIRY",
    display_name: "Dairy & Refrigerated",
    description: "Milk, cheese, and refrigerated items",
    is_taxable: true,
    minimum_age: null,
    requires_id_scan: false,
    is_lottery: false,
    sort_order: 8,
    icon_name: "milk",
    color_code: "#f8fafc",
    is_system: true,
    is_active: true,
    level: 1,
  },
  {
    code: "FROZEN",
    display_name: "Frozen Foods",
    description: "Frozen meals and ice cream",
    is_taxable: true,
    minimum_age: null,
    requires_id_scan: false,
    is_lottery: false,
    sort_order: 9,
    icon_name: "snowflake",
    color_code: "#06b6d4",
    is_system: true,
    is_active: true,
    level: 1,
  },
  {
    code: "HEALTH",
    display_name: "Health & Beauty",
    description: "Health, beauty, and personal care",
    is_taxable: true,
    minimum_age: null,
    requires_id_scan: false,
    is_lottery: false,
    sort_order: 10,
    icon_name: "heart-pulse",
    color_code: "#f43f5e",
    is_system: true,
    is_active: true,
    level: 1,
  },
  {
    code: "AUTO",
    display_name: "Automotive",
    description: "Automotive supplies and accessories",
    is_taxable: true,
    minimum_age: null,
    requires_id_scan: false,
    is_lottery: false,
    sort_order: 11,
    icon_name: "car",
    color_code: "#64748b",
    is_system: true,
    is_active: true,
    level: 1,
  },
  {
    code: "GENERAL",
    display_name: "General Merchandise",
    description: "Miscellaneous general merchandise",
    is_taxable: true,
    minimum_age: null,
    requires_id_scan: false,
    is_lottery: false,
    sort_order: 12,
    icon_name: "box",
    color_code: "#a855f7",
    is_system: true,
    is_active: true,
    level: 1,
  },
  {
    code: "SERVICES",
    display_name: "Services",
    description: "Non-taxable services",
    is_taxable: false,
    minimum_age: null,
    requires_id_scan: false,
    is_lottery: false,
    sort_order: 13,
    icon_name: "wrench",
    color_code: "#0ea5e9",
    is_system: true,
    is_active: true,
    level: 1,
  },
  {
    code: "MONEY_ORDERS",
    display_name: "Money Orders",
    description: "Money order services",
    is_taxable: false,
    minimum_age: null,
    requires_id_scan: false,
    is_lottery: false,
    sort_order: 14,
    icon_name: "banknote",
    color_code: "#84cc16",
    is_system: true,
    is_active: true,
    level: 1,
  },
  {
    code: "PREPAID",
    display_name: "Prepaid Cards",
    description: "Prepaid phone and gift cards",
    is_taxable: false,
    minimum_age: null,
    requires_id_scan: false,
    is_lottery: false,
    sort_order: 15,
    icon_name: "credit-card",
    color_code: "#8b5cf6",
    is_system: true,
    is_active: true,
    level: 1,
  },
];

/**
 * Seed departments into the database
 * Idempotent: Uses findFirst + create/update pattern since upsert doesn't work with nullable unique keys
 *
 * @param prisma - Prisma client instance
 */
export async function seedDepartments(prisma: PrismaClient): Promise<void> {
  console.log("Seeding departments...");

  let created = 0;
  let updated = 0;

  for (const department of SYSTEM_DEPARTMENTS) {
    // Find existing system department by code (client_id IS NULL)
    const existing = await prisma.department.findFirst({
      where: {
        code: department.code,
        client_id: null, // System-wide defaults have null client_id
      },
    });

    if (existing) {
      // Update existing
      await prisma.department.update({
        where: { department_id: existing.department_id },
        data: {
          display_name: department.display_name,
          description: department.description,
          is_taxable: department.is_taxable,
          minimum_age: department.minimum_age,
          requires_id_scan: department.requires_id_scan,
          is_lottery: department.is_lottery,
          sort_order: department.sort_order,
          icon_name: department.icon_name,
          color_code: department.color_code,
          is_system: true,
          is_active: true,
          level: department.level,
        },
      });
      updated++;
    } else {
      // Create new
      await prisma.department.create({
        data: {
          code: department.code,
          display_name: department.display_name,
          description: department.description,
          is_taxable: department.is_taxable,
          minimum_age: department.minimum_age,
          requires_id_scan: department.requires_id_scan,
          is_lottery: department.is_lottery,
          sort_order: department.sort_order,
          icon_name: department.icon_name,
          color_code: department.color_code,
          is_system: true,
          is_active: true,
          level: department.level ?? 1,
          // client_id, parent_id, and created_by are null for system types
        },
      });
      created++;
    }
  }

  console.log(
    `✅ Seeded ${SYSTEM_DEPARTMENTS.length} system departments (${created} created, ${updated} updated)`,
  );
}

// Allow running directly for testing
if (require.main === module) {
  const prisma = new PrismaClient();
  seedDepartments(prisma)
    .then(() => {
      console.log("Departments seed completed");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Departments seed failed:", error);
      process.exit(1);
    })
    .finally(() => {
      prisma.$disconnect();
    });
}
