/**
 * Global Test Setup
 *
 * This file runs ONCE before all tests start.
 * It cleans the database of any leftover test data from previous runs.
 *
 * IMPORTANT: Only deletes data that matches TEST MARKERS to avoid
 * accidentally deleting manually created data.
 *
 * Test data markers:
 * - Users: email ends with @test.nuvana.local, @test.com, or starts with test_, e2e-
 * - Companies: name starts with "Test " or "E2E "
 * - Stores: name starts with "Test " or "E2E "
 */

import { PrismaClient } from "@prisma/client";

// =============================================================================
// DATABASE PROTECTION - Validate we're connecting to a test database
// =============================================================================
const PROTECTED_DATABASE_PATTERNS = [
  /nuvana_dev/i,
  /nuvana_prod/i,
  /nuvana_production/i,
  /nuvana_staging/i,
];

const ALLOWED_TEST_DATABASE_PATTERNS = [
  /nuvana_test/i,
  /_test$/i,
  /_test_/i,
  /test_db/i,
];

function validateTestDatabase(): void {
  const dbUrl = process.env.DATABASE_URL || "";
  const isProtectedDb = PROTECTED_DATABASE_PATTERNS.some((p) => p.test(dbUrl));
  const isAllowedTestDb = ALLOWED_TEST_DATABASE_PATTERNS.some((p) =>
    p.test(dbUrl),
  );

  if (isProtectedDb && !isAllowedTestDb) {
    throw new Error(
      `\n🚨 PROTECTED DATABASE DETECTED - TESTS BLOCKED\n` +
        `DATABASE_URL points to: ${dbUrl}\n` +
        `Use a test database: postgresql://postgres:postgres@localhost:5432/nuvana_test\n`,
    );
  }
}

validateTestDatabase();
import { execSync } from "child_process";
import { join } from "path";

/**
 * Purge RabbitMQ queues to eliminate stale messages from previous test runs
 * This prevents flaky tests caused by messages from previous runs being processed
 *
 * Uses the external purge-rabbitmq.js script for proper RabbitMQ handling
 */
function purgeRabbitMQQueues(): void {
  try {
    const scriptPath = join(__dirname, "purge-rabbitmq.js");
    execSync(`node "${scriptPath}"`, {
      stdio: "inherit",
      env: process.env,
    });
  } catch (error) {
    // Script handles its own error logging, just continue
    console.log("   ○ RabbitMQ purge completed (check output above)\n");
  }
}

// Test email patterns - ONLY users matching these will be deleted
const TEST_EMAIL_PATTERNS = {
  domains: ["@test.nuvana.local", "@test.com"],
  prefixes: ["test_", "e2e-", "e2e_"],
};

// Test name patterns - ONLY entities matching these will be deleted
const TEST_NAME_PATTERNS = {
  prefixes: ["Test ", "E2E ", "test_", "e2e_"],
};

async function globalSetup() {
  console.log("\n🧹 Global Setup: Cleaning TEST DATA before tests...\n");
  console.log("   ℹ️  Only data with test markers will be deleted\n");

  // Purge RabbitMQ queues first to prevent stale messages from affecting tests
  await purgeRabbitMQQueues();

  const prisma = new PrismaClient();

  try {
    await prisma.$connect();

    // Find ONLY users with test email patterns
    const testUsers = await prisma.user.findMany({
      where: {
        OR: [
          // Match test email domains
          ...TEST_EMAIL_PATTERNS.domains.map((domain) => ({
            email: { endsWith: domain },
          })),
          // Match test email prefixes
          ...TEST_EMAIL_PATTERNS.prefixes.map((prefix) => ({
            email: { startsWith: prefix },
          })),
        ],
      },
      select: { user_id: true, email: true },
    });

    // Find ONLY companies with test name patterns
    const testCompanies = await prisma.company.findMany({
      where: {
        OR: TEST_NAME_PATTERNS.prefixes.map((prefix) => ({
          name: { startsWith: prefix },
        })),
      },
      select: { company_id: true, name: true },
    });

    // Find ONLY stores with test name patterns
    const testStores = await prisma.store.findMany({
      where: {
        OR: TEST_NAME_PATTERNS.prefixes.map((prefix) => ({
          name: { startsWith: prefix },
        })),
      },
      select: { store_id: true, name: true },
    });

    const userIds = testUsers.map((u) => u.user_id);
    const companyIds = testCompanies.map((c) => c.company_id);
    const storeIds = testStores.map((s) => s.store_id);

    console.log(`   Found ${userIds.length} test users to clean`);
    console.log(`   Found ${companyIds.length} test companies to clean`);
    console.log(`   Found ${storeIds.length} test stores to clean`);

    if (
      userIds.length === 0 &&
      companyIds.length === 0 &&
      storeIds.length === 0
    ) {
      console.log("\n✅ Database already clean\n");
      return;
    }

    // Delete in correct FK order using a transaction
    // FK relationships to consider:
    // - Transaction.cashier_id -> User.user_id
    // - Shift.cashier_id -> Cashier.cashier_id
    // - Shift.opened_by -> User.user_id
    // - Cashier.store_id -> Store.store_id
    // - Cashier.created_by -> User.user_id
    await prisma.$transaction(async (tx) => {
      // 1. Delete transactions for test stores/users
      if (storeIds.length > 0 || userIds.length > 0) {
        const txResult = await tx.transaction.deleteMany({
          where: {
            OR: [
              ...(storeIds.length > 0 ? [{ store_id: { in: storeIds } }] : []),
              ...(userIds.length > 0 ? [{ cashier_id: { in: userIds } }] : []),
            ],
          },
        });
        if (txResult.count > 0)
          console.log(`   Deleted ${txResult.count} transactions`);
      }

      // 2. Delete shifts for test stores/users
      // Note: Shift.opened_by references User, Shift.cashier_id references Cashier
      if (storeIds.length > 0 || userIds.length > 0) {
        const shiftResult = await tx.shift.deleteMany({
          where: {
            OR: [
              ...(storeIds.length > 0 ? [{ store_id: { in: storeIds } }] : []),
              ...(userIds.length > 0 ? [{ opened_by: { in: userIds } }] : []),
            ],
          },
        });
        if (shiftResult.count > 0)
          console.log(`   Deleted ${shiftResult.count} shifts`);
      }

      // 3. Delete cashiers for test stores/users (after shifts, before stores)
      // Note: Cashier.store_id references Store, Cashier.created_by references User
      if (storeIds.length > 0 || userIds.length > 0) {
        const cashierResult = await tx.cashier.deleteMany({
          where: {
            OR: [
              ...(storeIds.length > 0 ? [{ store_id: { in: storeIds } }] : []),
              ...(userIds.length > 0 ? [{ created_by: { in: userIds } }] : []),
            ],
          },
        });
        if (cashierResult.count > 0)
          console.log(`   Deleted ${cashierResult.count} cashiers`);
      }

      // 4. Delete POS terminals for test stores
      if (storeIds.length > 0) {
        const posResult = await tx.pOSTerminal.deleteMany({
          where: { store_id: { in: storeIds } },
        });
        if (posResult.count > 0)
          console.log(`   Deleted ${posResult.count} POS terminals`);
      }

      // 5. Delete user roles for test users/companies/stores
      const userRoleResult = await tx.userRole.deleteMany({
        where: {
          OR: [
            ...(userIds.length > 0 ? [{ user_id: { in: userIds } }] : []),
            ...(companyIds.length > 0
              ? [{ company_id: { in: companyIds } }]
              : []),
            ...(storeIds.length > 0 ? [{ store_id: { in: storeIds } }] : []),
          ],
        },
      });
      if (userRoleResult.count > 0)
        console.log(`   Deleted ${userRoleResult.count} user roles`);

      // 6. Delete test stores
      if (storeIds.length > 0) {
        const storeResult = await tx.store.deleteMany({
          where: { store_id: { in: storeIds } },
        });
        if (storeResult.count > 0)
          console.log(`   Deleted ${storeResult.count} stores`);
      }

      // 7. Delete test companies
      if (companyIds.length > 0) {
        const companyResult = await tx.company.deleteMany({
          where: { company_id: { in: companyIds } },
        });
        if (companyResult.count > 0)
          console.log(`   Deleted ${companyResult.count} companies`);
      }

      // 8. Delete test users
      if (userIds.length > 0) {
        const userResult = await tx.user.deleteMany({
          where: { user_id: { in: userIds } },
        });
        if (userResult.count > 0)
          console.log(`   Deleted ${userResult.count} users`);
      }

      // 9. Clean up orphaned audit logs (optional, for test data)
      const auditResult = await tx.auditLog.deleteMany({
        where: {
          OR: [
            { user_id: { in: userIds } },
            { reason: { contains: "test", mode: "insensitive" } },
          ],
        },
      });
      if (auditResult.count > 0)
        console.log(`   Deleted ${auditResult.count} audit logs`);
    });

    console.log("\n✅ Database cleanup complete\n");
  } catch (error) {
    console.error("❌ Global setup error:", error);
    // Don't throw - let tests run even if cleanup fails
  } finally {
    await prisma.$disconnect();
  }
}

export default globalSetup;
