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
import { georgiaCities, georgiaZipCodes } from "./georgia-counties";
import { usCountiesByState, getStatesWithCountyData } from "./us-counties";

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

    // Step 2: Seed ALL US Counties
    console.log("Step 2: Seeding counties for all US states...");
    const totalCountyCount = await seedAllUSCounties(states);
    console.log(`  ✓ ${totalCountyCount} counties seeded across all states\n`);

    // Step 3: Seed Georgia Cities (as sample data)
    console.log("Step 3: Seeding Georgia cities (sample data)...");
    const gaState = states.find((s) => s.code === "GA");
    if (gaState) {
      const cityCount = await seedCities(gaState.state_id);
      console.log(`  ✓ ${cityCount} Georgia cities seeded\n`);
    }

    // Step 4: Seed Georgia ZIP Codes (as sample data)
    console.log("Step 4: Seeding Georgia ZIP codes (sample data)...");
    if (gaState) {
      const zipCount = await seedZipCodes(gaState.state_id);
      console.log(`  ✓ ${zipCount} Georgia ZIP codes seeded\n`);
    }

    console.log("Geographic data seed completed successfully!");
  } catch (error) {
    console.error("Seed failed:", error);
    throw error;
  }
}

/**
 * Ensure all required states exist
 * All 50 US states + DC with FIPS codes and timezones
 */
async function ensureStates() {
  const stateData = [
    {
      code: "AL",
      name: "Alabama",
      fips_code: "01",
      timezone_default: "America/Chicago",
    },
    {
      code: "AK",
      name: "Alaska",
      fips_code: "02",
      timezone_default: "America/Anchorage",
    },
    {
      code: "AZ",
      name: "Arizona",
      fips_code: "04",
      timezone_default: "America/Phoenix",
    },
    {
      code: "AR",
      name: "Arkansas",
      fips_code: "05",
      timezone_default: "America/Chicago",
    },
    {
      code: "CA",
      name: "California",
      fips_code: "06",
      timezone_default: "America/Los_Angeles",
    },
    {
      code: "CO",
      name: "Colorado",
      fips_code: "08",
      timezone_default: "America/Denver",
    },
    {
      code: "CT",
      name: "Connecticut",
      fips_code: "09",
      timezone_default: "America/New_York",
    },
    {
      code: "DE",
      name: "Delaware",
      fips_code: "10",
      timezone_default: "America/New_York",
    },
    {
      code: "DC",
      name: "District of Columbia",
      fips_code: "11",
      timezone_default: "America/New_York",
    },
    {
      code: "FL",
      name: "Florida",
      fips_code: "12",
      timezone_default: "America/New_York",
    },
    {
      code: "GA",
      name: "Georgia",
      fips_code: "13",
      timezone_default: "America/New_York",
    },
    {
      code: "HI",
      name: "Hawaii",
      fips_code: "15",
      timezone_default: "Pacific/Honolulu",
    },
    {
      code: "ID",
      name: "Idaho",
      fips_code: "16",
      timezone_default: "America/Boise",
    },
    {
      code: "IL",
      name: "Illinois",
      fips_code: "17",
      timezone_default: "America/Chicago",
    },
    {
      code: "IN",
      name: "Indiana",
      fips_code: "18",
      timezone_default: "America/Indiana/Indianapolis",
    },
    {
      code: "IA",
      name: "Iowa",
      fips_code: "19",
      timezone_default: "America/Chicago",
    },
    {
      code: "KS",
      name: "Kansas",
      fips_code: "20",
      timezone_default: "America/Chicago",
    },
    {
      code: "KY",
      name: "Kentucky",
      fips_code: "21",
      timezone_default: "America/Kentucky/Louisville",
    },
    {
      code: "LA",
      name: "Louisiana",
      fips_code: "22",
      timezone_default: "America/Chicago",
    },
    {
      code: "ME",
      name: "Maine",
      fips_code: "23",
      timezone_default: "America/New_York",
    },
    {
      code: "MD",
      name: "Maryland",
      fips_code: "24",
      timezone_default: "America/New_York",
    },
    {
      code: "MA",
      name: "Massachusetts",
      fips_code: "25",
      timezone_default: "America/New_York",
    },
    {
      code: "MI",
      name: "Michigan",
      fips_code: "26",
      timezone_default: "America/Detroit",
    },
    {
      code: "MN",
      name: "Minnesota",
      fips_code: "27",
      timezone_default: "America/Chicago",
    },
    {
      code: "MS",
      name: "Mississippi",
      fips_code: "28",
      timezone_default: "America/Chicago",
    },
    {
      code: "MO",
      name: "Missouri",
      fips_code: "29",
      timezone_default: "America/Chicago",
    },
    {
      code: "MT",
      name: "Montana",
      fips_code: "30",
      timezone_default: "America/Denver",
    },
    {
      code: "NE",
      name: "Nebraska",
      fips_code: "31",
      timezone_default: "America/Chicago",
    },
    {
      code: "NV",
      name: "Nevada",
      fips_code: "32",
      timezone_default: "America/Los_Angeles",
    },
    {
      code: "NH",
      name: "New Hampshire",
      fips_code: "33",
      timezone_default: "America/New_York",
    },
    {
      code: "NJ",
      name: "New Jersey",
      fips_code: "34",
      timezone_default: "America/New_York",
    },
    {
      code: "NM",
      name: "New Mexico",
      fips_code: "35",
      timezone_default: "America/Denver",
    },
    {
      code: "NY",
      name: "New York",
      fips_code: "36",
      timezone_default: "America/New_York",
    },
    {
      code: "NC",
      name: "North Carolina",
      fips_code: "37",
      timezone_default: "America/New_York",
    },
    {
      code: "ND",
      name: "North Dakota",
      fips_code: "38",
      timezone_default: "America/Chicago",
    },
    {
      code: "OH",
      name: "Ohio",
      fips_code: "39",
      timezone_default: "America/New_York",
    },
    {
      code: "OK",
      name: "Oklahoma",
      fips_code: "40",
      timezone_default: "America/Chicago",
    },
    {
      code: "OR",
      name: "Oregon",
      fips_code: "41",
      timezone_default: "America/Los_Angeles",
    },
    {
      code: "PA",
      name: "Pennsylvania",
      fips_code: "42",
      timezone_default: "America/New_York",
    },
    {
      code: "RI",
      name: "Rhode Island",
      fips_code: "44",
      timezone_default: "America/New_York",
    },
    {
      code: "SC",
      name: "South Carolina",
      fips_code: "45",
      timezone_default: "America/New_York",
    },
    {
      code: "SD",
      name: "South Dakota",
      fips_code: "46",
      timezone_default: "America/Chicago",
    },
    {
      code: "TN",
      name: "Tennessee",
      fips_code: "47",
      timezone_default: "America/Chicago",
    },
    {
      code: "TX",
      name: "Texas",
      fips_code: "48",
      timezone_default: "America/Chicago",
    },
    {
      code: "UT",
      name: "Utah",
      fips_code: "49",
      timezone_default: "America/Denver",
    },
    {
      code: "VT",
      name: "Vermont",
      fips_code: "50",
      timezone_default: "America/New_York",
    },
    {
      code: "VA",
      name: "Virginia",
      fips_code: "51",
      timezone_default: "America/New_York",
    },
    {
      code: "WA",
      name: "Washington",
      fips_code: "53",
      timezone_default: "America/Los_Angeles",
    },
    {
      code: "WV",
      name: "West Virginia",
      fips_code: "54",
      timezone_default: "America/New_York",
    },
    {
      code: "WI",
      name: "Wisconsin",
      fips_code: "55",
      timezone_default: "America/Chicago",
    },
    {
      code: "WY",
      name: "Wyoming",
      fips_code: "56",
      timezone_default: "America/Denver",
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
 * Seed counties for ALL US states from the comprehensive us-counties data
 */
async function seedAllUSCounties(
  states: Array<{ state_id: string; code: string; name: string }>,
): Promise<number> {
  let totalCount = 0;
  const statesWithData = getStatesWithCountyData();

  // Create a map of state code to state_id for fast lookup
  const stateMap = new Map(states.map((s) => [s.code, s.state_id]));

  for (const stateCode of statesWithData) {
    const stateId = stateMap.get(stateCode);
    if (!stateId) {
      console.warn(`  Warning: State ${stateCode} not found in database`);
      continue;
    }

    const counties = usCountiesByState[stateCode];
    if (!counties || counties.length === 0) {
      continue;
    }

    let stateCount = 0;
    for (const county of counties) {
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
      stateCount++;
    }

    console.log(`    ${stateCode}: ${stateCount} counties`);
    totalCount += stateCount;
  }

  return totalCount;
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
