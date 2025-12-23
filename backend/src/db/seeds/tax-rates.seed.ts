/**
 * Tax Rate Seed Data
 *
 * Seeds the default system tax rates.
 * These are system-defined reference rates that can be customized per client.
 * Phase 1.3: Shift & Day Summary Implementation Plan
 */

// NOTE: Do NOT load dotenv here - DATABASE_URL comes from the environment
// This seed is called from seed.ts which passes the prisma client

import {
  PrismaClient,
  TaxRateType,
  TaxJurisdictionLevel,
} from "@prisma/client";

/**
 * System default tax rates
 * These have client_id = null, store_id = null, and is_system = true
 * They serve as templates that clients can copy or reference
 */
const SYSTEM_TAX_RATES: Array<{
  code: string;
  display_name: string;
  description: string;
  rate: number;
  rate_type: TaxRateType;
  jurisdiction_level: TaxJurisdictionLevel;
  jurisdiction_code: string | null;
  sort_order: number;
  is_compound: boolean;
}> = [
  // Texas State Tax (example)
  {
    code: "STATE_TX",
    display_name: "Texas State Sales Tax",
    description: "Texas state sales and use tax",
    rate: 0.0625, // 6.25%
    rate_type: "PERCENTAGE",
    jurisdiction_level: "STATE",
    jurisdiction_code: "TX",
    sort_order: 1,
    is_compound: false,
  },
  // California State Tax
  {
    code: "STATE_CA",
    display_name: "California State Sales Tax",
    description: "California state sales and use tax",
    rate: 0.0725, // 7.25%
    rate_type: "PERCENTAGE",
    jurisdiction_level: "STATE",
    jurisdiction_code: "CA",
    sort_order: 2,
    is_compound: false,
  },
  // Florida State Tax
  {
    code: "STATE_FL",
    display_name: "Florida State Sales Tax",
    description: "Florida state sales and use tax",
    rate: 0.06, // 6%
    rate_type: "PERCENTAGE",
    jurisdiction_level: "STATE",
    jurisdiction_code: "FL",
    sort_order: 3,
    is_compound: false,
  },
  // New York State Tax
  {
    code: "STATE_NY",
    display_name: "New York State Sales Tax",
    description: "New York state sales and use tax",
    rate: 0.04, // 4%
    rate_type: "PERCENTAGE",
    jurisdiction_level: "STATE",
    jurisdiction_code: "NY",
    sort_order: 4,
    is_compound: false,
  },
  // Local Tax Template (City level)
  {
    code: "LOCAL_CITY",
    display_name: "City Local Sales Tax",
    description: "City/municipality local sales tax",
    rate: 0.02, // 2% default
    rate_type: "PERCENTAGE",
    jurisdiction_level: "CITY",
    jurisdiction_code: null,
    sort_order: 10,
    is_compound: false,
  },
  // Local Tax Template (County level)
  {
    code: "LOCAL_COUNTY",
    display_name: "County Local Sales Tax",
    description: "County local sales tax",
    rate: 0.01, // 1% default
    rate_type: "PERCENTAGE",
    jurisdiction_level: "COUNTY",
    jurisdiction_code: null,
    sort_order: 11,
    is_compound: false,
  },
  // Special District Tax Template
  {
    code: "DISTRICT",
    display_name: "Special District Tax",
    description: "Special tax district (transit, stadium, etc.)",
    rate: 0.005, // 0.5% default
    rate_type: "PERCENTAGE",
    jurisdiction_level: "DISTRICT",
    jurisdiction_code: null,
    sort_order: 20,
    is_compound: false,
  },
  // Combined Rate Template (for convenience stores that want one rate)
  {
    code: "COMBINED_DEFAULT",
    display_name: "Combined Sales Tax",
    description: "Pre-combined state and local tax rate",
    rate: 0.0825, // 8.25% (common combined rate)
    rate_type: "PERCENTAGE",
    jurisdiction_level: "COMBINED",
    jurisdiction_code: null,
    sort_order: 100,
    is_compound: false,
  },
  // Zero Rate (for tax-exempt items)
  {
    code: "EXEMPT",
    display_name: "Tax Exempt",
    description: "Zero rate for tax-exempt items",
    rate: 0,
    rate_type: "PERCENTAGE",
    jurisdiction_level: "COMBINED",
    jurisdiction_code: null,
    sort_order: 999,
    is_compound: false,
  },
];

/**
 * Default effective date for system tax rates
 * Using 2020-01-01 as a safe historical date
 */
const DEFAULT_EFFECTIVE_DATE = new Date("2020-01-01");

/**
 * Seed tax rates into the database
 * Idempotent: Uses findFirst + create/update pattern
 *
 * @param prisma - Prisma client instance
 */
export async function seedTaxRates(prisma: PrismaClient): Promise<void> {
  console.log("Seeding tax rates...");

  let created = 0;
  let updated = 0;

  for (const taxRate of SYSTEM_TAX_RATES) {
    // Find existing system tax rate by code (client_id IS NULL, store_id IS NULL)
    const existing = await prisma.taxRate.findFirst({
      where: {
        code: taxRate.code,
        client_id: null,
        store_id: null,
      },
    });

    if (existing) {
      // Update existing
      await prisma.taxRate.update({
        where: { tax_rate_id: existing.tax_rate_id },
        data: {
          display_name: taxRate.display_name,
          description: taxRate.description,
          rate: taxRate.rate,
          rate_type: taxRate.rate_type,
          jurisdiction_level: taxRate.jurisdiction_level,
          jurisdiction_code: taxRate.jurisdiction_code,
          sort_order: taxRate.sort_order,
          is_compound: taxRate.is_compound,
          is_system: true,
          is_active: true,
        },
      });
      updated++;
    } else {
      // Create new
      await prisma.taxRate.create({
        data: {
          code: taxRate.code,
          display_name: taxRate.display_name,
          description: taxRate.description,
          rate: taxRate.rate,
          rate_type: taxRate.rate_type,
          jurisdiction_level: taxRate.jurisdiction_level,
          jurisdiction_code: taxRate.jurisdiction_code,
          effective_from: DEFAULT_EFFECTIVE_DATE,
          effective_to: null, // Open-ended
          sort_order: taxRate.sort_order,
          is_compound: taxRate.is_compound,
          is_system: true,
          is_active: true,
          // client_id, store_id, and created_by are null for system types
        },
      });
      created++;
    }
  }

  console.log(
    `✅ Seeded ${SYSTEM_TAX_RATES.length} system tax rates (${created} created, ${updated} updated)`,
  );
}

// Allow running directly for testing
if (require.main === module) {
  const prisma = new PrismaClient();
  seedTaxRates(prisma)
    .then(() => {
      console.log("Tax rates seed completed");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Tax rates seed failed:", error);
      process.exit(1);
    })
    .finally(() => {
      prisma.$disconnect();
    });
}
