/**
 * Backup Essential Data Script
 * Exports critical tables to JSON files for backup before migration
 */

import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();

const BACKUP_DIR = "c:/bmad/my-files/db_backup";

async function backupTable(tableName: string, data: any[]) {
  const filePath = path.join(BACKUP_DIR, `${tableName}.json`);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  console.log(
    `Backed up ${data.length} records from ${tableName} to ${filePath}`,
  );
}

async function main() {
  console.log("Starting backup of essential data...\n");

  // Ensure backup directory exists
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  try {
    // Backup users
    const users = await prisma.user.findMany();
    await backupTable("users", users);

    // Backup companies
    const companies = await prisma.company.findMany();
    await backupTable("companies", companies);

    // Backup stores
    const stores = await prisma.store.findMany();
    await backupTable("stores", stores);

    // Backup cashiers
    const cashiers = await prisma.cashier.findMany();
    await backupTable("cashiers", cashiers);

    // Backup roles
    const roles = await prisma.role.findMany();
    await backupTable("roles", roles);

    // Backup user_roles
    const userRoles = await prisma.userRole.findMany();
    await backupTable("user_roles", userRoles);

    // Backup permissions
    const permissions = await prisma.permission.findMany();
    await backupTable("permissions", permissions);

    // Backup role_permissions
    const rolePermissions = await prisma.rolePermission.findMany();
    await backupTable("role_permissions", rolePermissions);

    // Backup POS terminals
    const posTerminals = await prisma.pOSTerminal.findMany();
    await backupTable("pos_terminals", posTerminals);

    // Backup lottery games
    const lotteryGames = await prisma.lotteryGame.findMany();
    await backupTable("lottery_games", lotteryGames);

    // Backup lottery packs
    const lotteryPacks = await prisma.lotteryPack.findMany();
    await backupTable("lottery_packs", lotteryPacks);

    // Backup lottery bins
    const lotteryBins = await prisma.lotteryBin.findMany();
    await backupTable("lottery_bins", lotteryBins);

    // Backup lottery bin configurations
    const lotteryBinConfigs = await prisma.lotteryBinConfiguration.findMany();
    await backupTable("lottery_bin_configurations", lotteryBinConfigs);

    // Backup lottery business days
    const lotteryBusinessDays = await prisma.lotteryBusinessDay.findMany();
    await backupTable("lottery_business_days", lotteryBusinessDays);

    // Backup shifts
    const shifts = await prisma.shift.findMany();
    await backupTable("shifts", shifts);

    // Backup tender types (if they exist)
    try {
      const tenderTypes = await prisma.tenderType.findMany();
      await backupTable("tender_types", tenderTypes);
    } catch (e) {
      console.log("TenderType table not found or empty, skipping...");
    }

    // Backup departments (if they exist)
    try {
      const departments = await prisma.department.findMany();
      await backupTable("departments", departments);
    } catch (e) {
      console.log("Department table not found or empty, skipping...");
    }

    // Backup tax rates (if they exist)
    try {
      const taxRates = await prisma.taxRate.findMany();
      await backupTable("tax_rates", taxRates);
    } catch (e) {
      console.log("TaxRate table not found or empty, skipping...");
    }

    console.log("\n✅ Backup complete!");
    console.log(`All files saved to: ${BACKUP_DIR}`);
  } catch (error) {
    console.error("Backup failed:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
