/**
 * Geographic Data Seed Script
 *
 * Seeds US States, Counties, Cities, and ZIP Codes reference data.
 * Run with: npx tsx prisma/seeds/seed-geographic-data.ts
 *
 * @enterprise-standards
 * - DB-006: TENANT_ISOLATION - Reference data for tenant scoping
 * - DB-001: ORM_USAGE - Uses Prisma for all database operations
 * - SEC-006: SQL_INJECTION - No raw SQL, parameterized via Prisma
 * - DB-003: MIGRATIONS - Idempotent seed (uses createMany with skipDuplicates)
 * - PERF: Uses batch operations to avoid N+1 query patterns
 */

import { PrismaClient } from "@prisma/client";
import { georgiaCities, georgiaZipCodes } from "./georgia-counties";
import { usCountiesByState, getStatesWithCountyData } from "./us-counties";

const prisma = new PrismaClient();

/**
 * All 50 US states + DC with FIPS codes and timezones
 * Static reference data - no user input, no injection risk
 */
const US_STATES_DATA = [
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
] as const;

/**
 * Seed all geographic reference data using batch operations
 * Idempotent - uses createMany with skipDuplicates for insert-or-ignore behavior
 *
 * Performance: ~55 batch operations instead of ~3,250 individual queries
 */
async function seedGeographicData(): Promise<void> {
  console.log("Starting geographic data seed (batch mode)...\n");
  const startTime = Date.now();

  try {
    // Step 1: Batch seed all US States
    console.log("Step 1: Seeding US states (batch)...");
    const stateResult = await seedStatesBatch();
    console.log(
      `  ✓ ${stateResult.created} states created, ${stateResult.skipped} already existed\n`,
    );

    // Step 2: Fetch all states for FK resolution (single query)
    const states = await prisma.uSState.findMany({
      select: { state_id: true, code: true, name: true },
    });
    const stateMap = new Map(states.map((s) => [s.code, s.state_id]));

    // Step 3: Batch seed all US Counties
    console.log("Step 2: Seeding US counties (batch per state)...");
    const countyResult = await seedCountiesBatch(stateMap);
    console.log(
      `  ✓ ${countyResult.total} counties processed across ${countyResult.statesProcessed} states\n`,
    );

    // Step 4: Batch seed Georgia cities
    const gaStateId = stateMap.get("GA");
    if (gaStateId) {
      console.log("Step 3: Seeding Georgia cities (batch)...");
      const cityResult = await seedCitiesBatch(gaStateId);
      console.log(
        `  ✓ ${cityResult.created} cities created, ${cityResult.skipped} already existed\n`,
      );

      // Step 5: Batch seed Georgia ZIP codes
      console.log("Step 4: Seeding Georgia ZIP codes (batch)...");
      const zipResult = await seedZipCodesBatch(gaStateId);
      console.log(
        `  ✓ ${zipResult.created} ZIP codes created, ${zipResult.skipped} already existed\n`,
      );
    } else {
      console.warn(
        "  Warning: Georgia state not found, skipping cities and ZIP codes",
      );
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`Geographic data seed completed successfully in ${elapsed}s!`);
  } catch (error) {
    console.error("Seed failed:", error);
    throw error;
  }
}

/**
 * Batch seed all US states using createMany with skipDuplicates
 * Single database operation for 51 states
 */
async function seedStatesBatch(): Promise<{
  created: number;
  skipped: number;
}> {
  const dataToInsert = US_STATES_DATA.map((state) => ({
    code: state.code,
    name: state.name,
    fips_code: state.fips_code,
    timezone_default: state.timezone_default,
    is_active: true,
    lottery_enabled: true,
  }));

  const result = await prisma.uSState.createMany({
    data: dataToInsert,
    skipDuplicates: true, // Idempotent: skip if code already exists
  });

  return {
    created: result.count,
    skipped: US_STATES_DATA.length - result.count,
  };
}

/**
 * Batch seed counties per state using createMany with skipDuplicates
 * One batch operation per state (~51 operations instead of ~3,100)
 */
async function seedCountiesBatch(
  stateMap: Map<string, string>,
): Promise<{ total: number; statesProcessed: number }> {
  let totalCount = 0;
  let statesProcessed = 0;
  const statesWithData = getStatesWithCountyData();

  for (const stateCode of statesWithData) {
    const stateId = stateMap.get(stateCode);
    if (!stateId) {
      console.warn(`    Warning: State ${stateCode} not found in database`);
      continue;
    }

    const counties =
      usCountiesByState[stateCode as keyof typeof usCountiesByState];
    if (!counties || counties.length === 0) {
      continue;
    }

    // Batch insert all counties for this state
    const dataToInsert = counties.map((county) => ({
      state_id: stateId,
      name: county.name,
      fips_code: county.fips_code,
      county_seat: county.county_seat ?? null,
      population: county.population ?? null,
      is_active: true,
    }));

    const result = await prisma.uSCounty.createMany({
      data: dataToInsert,
      skipDuplicates: true, // Idempotent: skip if fips_code already exists
    });

    console.log(
      `    ${stateCode}: ${result.count}/${counties.length} counties`,
    );
    totalCount += result.count;
    statesProcessed++;
  }

  return { total: totalCount, statesProcessed };
}

/**
 * Batch seed Georgia cities using createMany with skipDuplicates
 * Fetches county map first (1 query), then batch inserts (1 query)
 */
async function seedCitiesBatch(
  stateId: string,
): Promise<{ created: number; skipped: number }> {
  // Single query to get all Georgia counties for FK resolution
  const counties = await prisma.uSCounty.findMany({
    where: { state_id: stateId },
    select: { county_id: true, name: true },
  });
  const countyMap = new Map(counties.map((c) => [c.name, c.county_id]));

  // Build batch insert data, filtering out cities with missing counties
  const dataToInsert: Array<{
    state_id: string;
    county_id: string;
    name: string;
    is_active: boolean;
    is_incorporated: boolean;
  }> = [];

  for (const city of georgiaCities) {
    const countyId = countyMap.get(city.county);
    if (!countyId) {
      console.warn(
        `    Warning: County "${city.county}" not found for city "${city.name}"`,
      );
      continue;
    }
    dataToInsert.push({
      state_id: stateId,
      county_id: countyId,
      name: city.name,
      is_active: true,
      is_incorporated: true,
    });
  }

  // Single batch insert
  const result = await prisma.uSCity.createMany({
    data: dataToInsert,
    skipDuplicates: true, // Idempotent: skip if (county_id, name) already exists
  });

  return {
    created: result.count,
    skipped: dataToInsert.length - result.count,
  };
}

/**
 * Batch seed Georgia ZIP codes using createMany with skipDuplicates
 * Fetches county/city maps first (2 queries), then batch inserts (1 query)
 */
async function seedZipCodesBatch(
  stateId: string,
): Promise<{ created: number; skipped: number }> {
  // Single query to get all Georgia counties
  const counties = await prisma.uSCounty.findMany({
    where: { state_id: stateId },
    select: { county_id: true, name: true },
  });
  const countyMap = new Map(counties.map((c) => [c.name, c.county_id]));

  // Single query to get all Georgia cities
  const cities = await prisma.uSCity.findMany({
    where: { state_id: stateId },
    select: { city_id: true, name: true, county_id: true },
  });
  const cityMap = new Map(
    cities.map((c) => [`${c.name}:${c.county_id}`, c.city_id]),
  );

  // Build batch insert data
  const dataToInsert = georgiaZipCodes.map((zip) => {
    const countyId = countyMap.get(zip.county) ?? null;
    const cityId = countyId
      ? (cityMap.get(`${zip.city_name}:${countyId}`) ?? null)
      : null;

    return {
      zip_code: zip.zip_code,
      state_id: stateId,
      county_id: countyId,
      city_id: cityId,
      city_name: zip.city_name,
      is_active: true,
      is_primary: true,
    };
  });

  // Single batch insert
  const result = await prisma.uSZipCode.createMany({
    data: dataToInsert,
    skipDuplicates: true, // Idempotent: skip if zip_code already exists
  });

  return {
    created: result.count,
    skipped: dataToInsert.length - result.count,
  };
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
