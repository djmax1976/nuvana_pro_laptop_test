/**
 * Process FGM (Fuel Grade Movement) files and update DaySummary with fuel sales
 *
 * This script reads FGM files from the BOOutbox directory and aggregates
 * fuel sales data into the DaySummary table for dashboard display.
 *
 * Usage: npx ts-node scripts/process-fgm-files.ts
 */

import * as fs from "fs";
import * as path from "path";
import { PrismaClient } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { XMLParser } from "fast-xml-parser";

const prisma = new PrismaClient();

// Configuration
const FGM_DIRECTORY = "C:\\bmad\\my-files\\GILBARCO\\BOOutBox";
const STORE_ID = "3a9c9d9d-9c81-4e62-b2f3-fdf5ba0b2fe4"; // Store 299

interface FGMSalesTotals {
  FuelGradeSalesVolume: string;
  FuelGradeSalesAmount: string;
  DiscountAmount?: string;
  DiscountCount?: string;
}

interface FGMServiceLevelSummary {
  ServiceLevelCode: string;
  FGMSalesTotals: FGMSalesTotals;
}

interface FGMSellPriceSummary {
  ActualSalesPrice: string;
  FGMServiceLevelSummary: FGMServiceLevelSummary;
}

interface FGMTenderSummary {
  Tender: {
    TenderCode: string;
    TenderSubCode: string;
  };
  FGMSellPriceSummary: FGMSellPriceSummary;
}

interface FGMDetail {
  FuelGradeID: string;
  FGMTenderSummary: FGMTenderSummary;
}

interface MovementHeader {
  ReportSequenceNumber: string;
  PrimaryReportPeriod: string;
  SecondaryReportPeriod: string;
  BusinessDate: string;
  BeginDate: string;
  BeginTime: string;
  EndDate: string;
  EndTime: string;
}

interface FuelGradeMovement {
  MovementHeader: MovementHeader;
  FGMDetail: FGMDetail | FGMDetail[];
}

interface NAXMLMovementReport {
  "NAXML-MovementReport": {
    TransmissionHeader: {
      StoreLocationID: string;
      VendorName: string;
      VendorModelVersion: string;
    };
    FuelGradeMovement: FuelGradeMovement;
  };
}

/**
 * Parse a single FGM XML file
 */
function parseFGMFile(
  filePath: string,
): { businessDate: string; fuelSales: number; fuelGallons: number } | null {
  try {
    const xml = fs.readFileSync(filePath, "utf-8");

    const parser = new XMLParser({
      ignoreAttributes: true,
      parseTagValue: true,
    });

    const parsed = parser.parse(xml) as NAXMLMovementReport;

    if (!parsed["NAXML-MovementReport"]?.FuelGradeMovement) {
      return null;
    }

    const fgm = parsed["NAXML-MovementReport"].FuelGradeMovement;
    const businessDate = fgm.MovementHeader.BusinessDate;

    // Aggregate all fuel sales from FGMDetail entries
    let totalSales = 0;
    let totalGallons = 0;

    const details = Array.isArray(fgm.FGMDetail)
      ? fgm.FGMDetail
      : [fgm.FGMDetail];

    for (const detail of details) {
      if (
        !detail?.FGMTenderSummary?.FGMSellPriceSummary?.FGMServiceLevelSummary
          ?.FGMSalesTotals
      ) {
        continue;
      }

      const salesTotals =
        detail.FGMTenderSummary.FGMSellPriceSummary.FGMServiceLevelSummary
          .FGMSalesTotals;

      const salesAmount = parseFloat(salesTotals.FuelGradeSalesAmount || "0");
      const salesVolume = parseFloat(salesTotals.FuelGradeSalesVolume || "0");

      totalSales += salesAmount;
      totalGallons += salesVolume;
    }

    return {
      businessDate,
      fuelSales: totalSales,
      fuelGallons: totalGallons,
    };
  } catch (error) {
    console.error(`Error parsing ${filePath}:`, error);
    return null;
  }
}

/**
 * Process all FGM files and aggregate by business date
 */
async function processFGMFiles(): Promise<void> {
  console.log("=== FGM File Processor ===\n");
  console.log(`Directory: ${FGM_DIRECTORY}`);
  console.log(`Store ID: ${STORE_ID}\n`);

  // Get all FGM files
  const files = fs
    .readdirSync(FGM_DIRECTORY)
    .filter((f) => f.startsWith("FGM") && f.endsWith(".xml"));

  console.log(`Found ${files.length} FGM files\n`);

  // Aggregate by business date
  const dateAggregates: Map<
    string,
    { fuelSales: number; fuelGallons: number; fileCount: number }
  > = new Map();

  for (const file of files) {
    const filePath = path.join(FGM_DIRECTORY, file);
    const result = parseFGMFile(filePath);

    if (result) {
      const existing = dateAggregates.get(result.businessDate) || {
        fuelSales: 0,
        fuelGallons: 0,
        fileCount: 0,
      };
      existing.fuelSales += result.fuelSales;
      existing.fuelGallons += result.fuelGallons;
      existing.fileCount++;
      dateAggregates.set(result.businessDate, existing);

      console.log(
        `  ${file}: ${result.businessDate} - $${result.fuelSales.toFixed(2)}, ${result.fuelGallons.toFixed(3)} gal`,
      );
    }
  }

  console.log("\n=== Aggregated by Business Date ===\n");

  // Sort dates
  const sortedDates = Array.from(dateAggregates.keys()).sort();

  for (const date of sortedDates) {
    const agg = dateAggregates.get(date)!;
    console.log(
      `${date}: $${agg.fuelSales.toFixed(2)} fuel sales, ${agg.fuelGallons.toFixed(3)} gallons (from ${agg.fileCount} files)`,
    );
  }

  console.log("\n=== Updating DaySummary Records ===\n");

  // Update DaySummary records
  for (const date of sortedDates) {
    const agg = dateAggregates.get(date)!;
    const businessDate = new Date(date);

    // Find or create DaySummary for this date
    const existing = await prisma.daySummary.findFirst({
      where: {
        store_id: STORE_ID,
        business_date: businessDate,
      },
    });

    if (existing) {
      // Update existing record
      await prisma.daySummary.update({
        where: { day_summary_id: existing.day_summary_id },
        data: {
          fuel_sales: new Decimal(agg.fuelSales.toFixed(2)),
          fuel_gallons: new Decimal(agg.fuelGallons.toFixed(3)),
        },
      });
      console.log(
        `  Updated DaySummary for ${date}: fuel_sales=$${agg.fuelSales.toFixed(2)}, fuel_gallons=${agg.fuelGallons.toFixed(3)}`,
      );
    } else {
      // Get company_id from store
      const store = await prisma.store.findUnique({
        where: { store_id: STORE_ID },
        select: { company_id: true },
      });

      if (!store) {
        console.error(`  Store ${STORE_ID} not found!`);
        continue;
      }

      // Create new DaySummary
      await prisma.daySummary.create({
        data: {
          store_id: STORE_ID,
          business_date: businessDate,
          fuel_sales: new Decimal(agg.fuelSales.toFixed(2)),
          fuel_gallons: new Decimal(agg.fuelGallons.toFixed(3)),
          net_sales: new Decimal(0),
          gross_sales: new Decimal(0),
          tax_collected: new Decimal(0),
          transaction_count: 0,
        },
      });
      console.log(
        `  Created DaySummary for ${date}: fuel_sales=$${agg.fuelSales.toFixed(2)}, fuel_gallons=${agg.fuelGallons.toFixed(3)}`,
      );
    }
  }

  console.log("\n=== Done ===\n");

  // Verify results
  const summaries = await prisma.daySummary.findMany({
    where: { store_id: STORE_ID },
    orderBy: { business_date: "desc" },
    take: 10,
  });

  console.log("Current DaySummary records:");
  for (const s of summaries) {
    console.log(
      `  ${s.business_date.toISOString().split("T")[0]}: fuel_sales=$${s.fuel_sales?.toString() || "null"}, fuel_gallons=${s.fuel_gallons?.toString() || "null"}`,
    );
  }
}

// Main
processFGMFiles()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
