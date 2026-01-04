/**
 * Geographic Data Seed Script
 *
 * Seeds US States, Counties, Cities, and ZIP Codes reference data.
 * Run with: npx ts-node prisma/seeds/seed-geographic-data.ts
 *
 * @enterprise-standards
 * - DB-006: TENANT_ISOLATION - Reference data for tenant scoping
 * - DB-001: ORM_USAGE - Uses Prisma for all database operations
 * - SEC-006: SQL_INJECTION - No raw SQL, parameterized via Prisma
 * - DB-003: MIGRATIONS - Idempotent seed (uses upsert)
 */

import { PrismaClient } from "@prisma/client";
import {
  georgiaCounties,
  georgiaCities,
  georgiaZipCodes,
} from "./georgia-counties";

const prisma = new PrismaClient();

/**
 * Seed all geographic reference data
 * Idempotent - safe to run multiple times
 */
async function seedGeographicData(): Promise<void> {
  console.log("Starting geographic data seed...\n");

  try {
    // Step 1: Seed States (GA, NC, SC already seeded in migration, but verify)
    console.log("Step 1: Verifying states...");
    const states = await ensureStates();
    console.log(`  ✓ ${states.length} states verified\n`);

    // Step 2: Seed Georgia Counties
    console.log("Step 2: Seeding Georgia counties...");
    const gaState = states.find((s) => s.code === "GA");
    if (!gaState) {
      throw new Error("Georgia state not found");
    }
    const countyCount = await seedCounties(gaState.state_id);
    console.log(`  ✓ ${countyCount} Georgia counties seeded\n`);

    // Step 3: Seed Georgia Cities
    console.log("Step 3: Seeding Georgia cities...");
    const cityCount = await seedCities(gaState.state_id);
    console.log(`  ✓ ${cityCount} Georgia cities seeded\n`);

    // Step 4: Seed Georgia ZIP Codes
    console.log("Step 4: Seeding Georgia ZIP codes...");
    const zipCount = await seedZipCodes(gaState.state_id);
    console.log(`  ✓ ${zipCount} Georgia ZIP codes seeded\n`);

    console.log("Geographic data seed completed successfully!");
  } catch (error) {
    console.error("Seed failed:", error);
    throw error;
  }
}

/**
 * Ensure all required states exist
 */
async function ensureStates() {
  const stateData = [
    {
      code: "GA",
      name: "Georgia",
      fips_code: "13",
      timezone_default: "America/New_York",
    },
    {
      code: "NC",
      name: "North Carolina",
      fips_code: "37",
      timezone_default: "America/New_York",
    },
    {
      code: "SC",
      name: "South Carolina",
      fips_code: "45",
      timezone_default: "America/New_York",
    },
  ];

  const results = [];

  for (const state of stateData) {
    const result = await prisma.uSState.upsert({
      where: { code: state.code },
      update: {}, // Don't update if exists
      create: {
        code: state.code,
        name: state.name,
        fips_code: state.fips_code,
        timezone_default: state.timezone_default,
        is_active: true,
        lottery_enabled: true,
      },
    });
    results.push(result);
  }

  return results;
}

/**
 * Seed Georgia counties from reference data
 */
async function seedCounties(stateId: string): Promise<number> {
  let count = 0;

  for (const county of georgiaCounties) {
    await prisma.uSCounty.upsert({
      where: { fips_code: county.fips_code },
      update: {}, // Don't update if exists
      create: {
        state_id: stateId,
        name: county.name,
        fips_code: county.fips_code,
        county_seat: county.county_seat,
        population: county.population,
        is_active: true,
      },
    });
    count++;
  }

  return count;
}

/**
 * Seed Georgia cities from reference data
 */
async function seedCities(stateId: string): Promise<number> {
  let count = 0;

  // Get all Georgia counties for lookup
  const counties = await prisma.uSCounty.findMany({
    where: { state_id: stateId },
    select: { county_id: true, name: true },
  });

  const countyMap = new Map(counties.map((c) => [c.name, c.county_id]));

  for (const city of georgiaCities) {
    const countyId = countyMap.get(city.county);
    if (!countyId) {
      console.warn(
        `  Warning: County "${city.county}" not found for city "${city.name}"`,
      );
      continue;
    }

    // Check if city already exists
    const existing = await prisma.uSCity.findFirst({
      where: {
        county_id: countyId,
        name: city.name,
      },
    });

    if (!existing) {
      await prisma.uSCity.create({
        data: {
          state_id: stateId,
          county_id: countyId,
          name: city.name,
          is_active: true,
          is_incorporated: true,
        },
      });
      count++;
    }
  }

  return count;
}

/**
 * Seed Georgia ZIP codes from reference data
 */
async function seedZipCodes(stateId: string): Promise<number> {
  let count = 0;

  // Get all Georgia counties for lookup
  const counties = await prisma.uSCounty.findMany({
    where: { state_id: stateId },
    select: { county_id: true, name: true },
  });

  const countyMap = new Map(counties.map((c) => [c.name, c.county_id]));

  // Get all Georgia cities for lookup
  const cities = await prisma.uSCity.findMany({
    where: { state_id: stateId },
    select: { city_id: true, name: true, county_id: true },
  });

  // Create city lookup map (city name + county_id -> city_id)
  const cityMap = new Map(
    cities.map((c) => [`${c.name}:${c.county_id}`, c.city_id]),
  );

  for (const zip of georgiaZipCodes) {
    const countyId = countyMap.get(zip.county);

    // Try to find city_id
    let cityId: string | undefined;
    if (countyId) {
      cityId = cityMap.get(`${zip.city_name}:${countyId}`);
    }

    await prisma.uSZipCode.upsert({
      where: { zip_code: zip.zip_code },
      update: {}, // Don't update if exists
      create: {
        zip_code: zip.zip_code,
        state_id: stateId,
        county_id: countyId || null,
        city_id: cityId || null,
        city_name: zip.city_name,
        is_active: true,
        is_primary: true,
      },
    });
    count++;
  }

  return count;
}

// Run the seed
seedGeographicData()
  .then(() => {
    console.log("\nSeed completed.");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\nSeed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
