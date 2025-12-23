/**
 * TenderType Seed Data
 *
 * Seeds the default system tender types (payment methods).
 * These are system-defined and cannot be deleted by clients.
 * Phase 1.1: Shift & Day Summary Implementation Plan
 */

// NOTE: Do NOT load dotenv here - DATABASE_URL comes from the environment
// This seed is called from seed.ts which passes the prisma client

import { PrismaClient, Prisma } from "@prisma/client";

/**
 * System default tender types
 * These have client_id = null (system-wide) and is_system = true
 */
const SYSTEM_TENDER_TYPES: Omit<
  Prisma.TenderTypeCreateInput,
  "client" | "created_by_user"
>[] = [
  {
    code: "CASH",
    display_name: "Cash",
    description: "Physical currency payment",
    is_cash_equivalent: true,
    requires_reference: false,
    is_electronic: false,
    affects_cash_drawer: true,
    sort_order: 1,
    icon_name: "banknote",
    color_code: "#22c55e",
    is_system: true,
    is_active: true,
  },
  {
    code: "CREDIT",
    display_name: "Credit Card",
    description: "Credit card payment (Visa, Mastercard, Amex, Discover)",
    is_cash_equivalent: false,
    requires_reference: false,
    is_electronic: true,
    affects_cash_drawer: false,
    sort_order: 2,
    icon_name: "credit-card",
    color_code: "#3b82f6",
    is_system: true,
    is_active: true,
  },
  {
    code: "DEBIT",
    display_name: "Debit Card",
    description: "Debit card payment with PIN",
    is_cash_equivalent: false,
    requires_reference: false,
    is_electronic: true,
    affects_cash_drawer: false,
    sort_order: 3,
    icon_name: "credit-card",
    color_code: "#8b5cf6",
    is_system: true,
    is_active: true,
  },
  {
    code: "EBT_FOOD",
    display_name: "EBT Food",
    description: "Electronic Benefit Transfer - SNAP/Food Stamps",
    is_cash_equivalent: false,
    requires_reference: false,
    is_electronic: true,
    affects_cash_drawer: false,
    sort_order: 4,
    icon_name: "shopping-cart",
    color_code: "#f59e0b",
    is_system: true,
    is_active: true,
  },
  {
    code: "EBT_CASH",
    display_name: "EBT Cash",
    description: "Electronic Benefit Transfer - Cash Benefits",
    is_cash_equivalent: false,
    requires_reference: false,
    is_electronic: true,
    affects_cash_drawer: false,
    sort_order: 5,
    icon_name: "wallet",
    color_code: "#f97316",
    is_system: true,
    is_active: true,
  },
  {
    code: "CHECK",
    display_name: "Check",
    description: "Personal or business check",
    is_cash_equivalent: false,
    requires_reference: true,
    is_electronic: false,
    affects_cash_drawer: true,
    sort_order: 6,
    icon_name: "file-text",
    color_code: "#64748b",
    is_system: true,
    is_active: true,
  },
  {
    code: "GIFT_CARD",
    display_name: "Gift Card",
    description: "Store gift card or gift certificate",
    is_cash_equivalent: false,
    requires_reference: true,
    is_electronic: false,
    affects_cash_drawer: false,
    sort_order: 7,
    icon_name: "gift",
    color_code: "#ec4899",
    is_system: true,
    is_active: true,
  },
  {
    code: "STORE_CREDIT",
    display_name: "Store Credit",
    description: "Store credit from returns or promotions",
    is_cash_equivalent: false,
    requires_reference: true,
    is_electronic: false,
    affects_cash_drawer: false,
    sort_order: 8,
    icon_name: "receipt",
    color_code: "#14b8a6",
    is_system: true,
    is_active: true,
  },
  {
    code: "MOBILE_PAY",
    display_name: "Mobile Payment",
    description: "Apple Pay, Google Pay, Samsung Pay, etc.",
    is_cash_equivalent: false,
    requires_reference: false,
    is_electronic: true,
    affects_cash_drawer: false,
    sort_order: 9,
    icon_name: "smartphone",
    color_code: "#06b6d4",
    is_system: true,
    is_active: true,
  },
];

/**
 * Seed tender types into the database
 * Idempotent: Uses findFirst + create/update pattern since upsert doesn't work with nullable unique keys
 *
 * @param prisma - Prisma client instance
 */
export async function seedTenderTypes(prisma: PrismaClient): Promise<void> {
  console.log("Seeding tender types...");

  let created = 0;
  let updated = 0;

  for (const tenderType of SYSTEM_TENDER_TYPES) {
    // Find existing system tender type by code (client_id IS NULL)
    const existing = await prisma.tenderType.findFirst({
      where: {
        code: tenderType.code,
        client_id: null, // System-wide defaults have null client_id
      },
    });

    if (existing) {
      // Update existing
      await prisma.tenderType.update({
        where: { tender_type_id: existing.tender_type_id },
        data: {
          display_name: tenderType.display_name,
          description: tenderType.description,
          is_cash_equivalent: tenderType.is_cash_equivalent,
          requires_reference: tenderType.requires_reference,
          is_electronic: tenderType.is_electronic,
          affects_cash_drawer: tenderType.affects_cash_drawer,
          sort_order: tenderType.sort_order,
          icon_name: tenderType.icon_name,
          color_code: tenderType.color_code,
          is_system: true,
          is_active: true,
        },
      });
      updated++;
    } else {
      // Create new
      await prisma.tenderType.create({
        data: {
          code: tenderType.code,
          display_name: tenderType.display_name,
          description: tenderType.description,
          is_cash_equivalent: tenderType.is_cash_equivalent,
          requires_reference: tenderType.requires_reference,
          is_electronic: tenderType.is_electronic,
          affects_cash_drawer: tenderType.affects_cash_drawer,
          sort_order: tenderType.sort_order,
          icon_name: tenderType.icon_name,
          color_code: tenderType.color_code,
          is_system: true,
          is_active: true,
          // client_id and created_by are null for system types
        },
      });
      created++;
    }
  }

  console.log(
    `✅ Seeded ${SYSTEM_TENDER_TYPES.length} system tender types (${created} created, ${updated} updated)`,
  );
}

// Allow running directly for testing
if (require.main === module) {
  const prisma = new PrismaClient();
  seedTenderTypes(prisma)
    .then(() => {
      console.log("Tender types seed completed");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Tender types seed failed:", error);
      process.exit(1);
    })
    .finally(() => {
      prisma.$disconnect();
    });
}
