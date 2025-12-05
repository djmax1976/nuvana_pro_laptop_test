/**
 * Test Cleanup Helper
 *
 * Provides robust cleanup functions for E2E tests to ensure database
 * is cleaned up properly after each test run.
 *
 * IMPORTANT: Always delete in this order to respect foreign key constraints:
 * 1. Transactions (references shifts + users)
 * 2. Shifts (references users)
 * 3. User Roles (references users)
 * 4. Users
 * 5. Clients, Companies, Stores (as needed)
 */

import { PrismaClient } from "@prisma/client";

/**
 * Delete a user and all their related data in the correct order
 * @param prisma - Prisma client instance
 * @param userId - User ID to delete
 * @param options - Additional cleanup options
 */
export async function deleteUserWithRelatedData(
  prisma: PrismaClient,
  userId: string,
  options: {
    deleteShifts?: boolean;
    deleteTransactions?: boolean;
    verbose?: boolean;
  } = {},
): Promise<void> {
  const {
    deleteShifts = true,
    deleteTransactions = true,
    verbose = false,
  } = options;

  try {
    // Check if user exists first
    const userExists = await prisma.user.findUnique({
      where: { user_id: userId },
      select: { user_id: true },
    });

    if (!userExists) {
      if (verbose) console.log(`User ${userId} not found, skipping cleanup`);
      return;
    }

    // Step 1: Get all shifts for this user (needed for transaction cleanup)
    const userShifts = await prisma.shift.findMany({
      where: { cashier_id: userId },
      select: { shift_id: true },
    });

    // Step 2: Delete transactions FIRST (FK: transactions.shift_id -> shifts + transactions.cashier_id -> users)
    if (deleteTransactions) {
      // Delete transactions linked to shifts
      if (userShifts.length > 0) {
        await prisma.transaction.deleteMany({
          where: {
            shift_id: { in: userShifts.map((s) => s.shift_id) },
          },
        });
      }

      // Delete transactions directly linked to user
      await prisma.transaction.deleteMany({
        where: { cashier_id: userId },
      });

      if (verbose) console.log(`✓ Deleted transactions for user ${userId}`);
    }

    // Step 3: Delete shifts (FK: shifts.cashier_id -> users)
    if (deleteShifts) {
      await prisma.shift.deleteMany({
        where: { cashier_id: userId },
      });

      if (verbose) console.log(`✓ Deleted shifts for user ${userId}`);
    }

    // Step 4: Delete user roles (FK: user_roles.user_id -> users)
    await prisma.userRole.deleteMany({
      where: { user_id: userId },
    });

    if (verbose) console.log(`✓ Deleted user roles for user ${userId}`);

    // Step 5: Delete cashiers created/updated by this user (FK: cashiers_created_by_fkey, cashiers_updated_by_fkey)
    await prisma.cashier.deleteMany({
      where: {
        OR: [{ created_by: userId }, { updated_by: userId }],
      },
    });

    if (verbose)
      console.log(`✓ Deleted cashiers created/updated by user ${userId}`);

    // Step 6: Finally delete the user
    await prisma.user.delete({
      where: { user_id: userId },
    });

    if (verbose) console.log(`✓ Deleted user ${userId}`);
  } catch (error) {
    console.error(`Error deleting user ${userId}:`, error);
    throw error;
  }
}

/**
 * Delete multiple users and their related data
 * @param prisma - Prisma client instance
 * @param userIds - Array of user IDs to delete
 */
export async function deleteUsersWithRelatedData(
  prisma: PrismaClient,
  userIds: string[],
): Promise<void> {
  for (const userId of userIds) {
    await deleteUserWithRelatedData(prisma, userId, { verbose: false });
  }
}

// Client model removed - deleteClientWithRelatedData no longer needed

/**
 * Delete a company and all related data
 * @param prisma - Prisma client instance
 * @param companyId - Company ID to delete
 */
export async function deleteCompanyWithRelatedData(
  prisma: PrismaClient,
  companyId: string,
): Promise<void> {
  try {
    // Check if company exists first
    const companyExists = await prisma.company.findUnique({
      where: { company_id: companyId },
      select: { company_id: true },
    });

    if (!companyExists) {
      return; // Already deleted, nothing to do
    }

    // Step 1: Delete stores first (FK: stores.company_id -> companies)
    await prisma.store.deleteMany({
      where: { company_id: companyId },
    });

    // Step 2: Delete user roles linked to this company (FK: user_roles.company_id -> companies)
    await prisma.userRole.deleteMany({
      where: { company_id: companyId },
    });

    // Step 3: Delete company
    await prisma.company.delete({
      where: { company_id: companyId },
    });
  } catch (error) {
    console.error(`Error deleting company ${companyId}:`, error);
    // Don't throw - cleanup should be non-blocking
  }
}

/**
 * Delete a store and all related data
 * @param prisma - Prisma client instance
 * @param storeId - Store ID to delete
 */
export async function deleteStoreWithRelatedData(
  prisma: PrismaClient,
  storeId: string,
): Promise<void> {
  try {
    // Check if store exists first
    const storeExists = await prisma.store.findUnique({
      where: { store_id: storeId },
      select: { store_id: true },
    });

    if (!storeExists) {
      return; // Already deleted, nothing to do
    }

    // Step 1: Delete user roles linked to this store (FK: user_roles.store_id -> stores)
    await prisma.userRole.deleteMany({
      where: { store_id: storeId },
    });

    // Step 2: Delete shifts at this store (FK: shifts.store_id -> stores)
    const shifts = await prisma.shift.findMany({
      where: { store_id: storeId },
      select: { shift_id: true },
    });

    // Delete transactions for these shifts first
    if (shifts.length > 0) {
      await prisma.transaction.deleteMany({
        where: {
          shift_id: { in: shifts.map((s) => s.shift_id) },
        },
      });

      await prisma.shift.deleteMany({
        where: { store_id: storeId },
      });
    }

    // Step 3: Delete store
    await prisma.store.delete({
      where: { store_id: storeId },
    });
  } catch (error) {
    console.error(`Error deleting store ${storeId}:`, error);
    // Don't throw - cleanup should be non-blocking
  }
}

/**
 * Cleanup helper for afterAll hooks
 * Safely deletes test data with proper error handling
 */
export async function cleanupTestData(
  prisma: PrismaClient,
  cleanup: {
    users?: string[];
    companies?: string[];
    stores?: string[];
  },
): Promise<void> {
  try {
    // Delete in correct order

    if (cleanup.stores) {
      for (const storeId of cleanup.stores) {
        await deleteStoreWithRelatedData(prisma, storeId).catch(() => {});
      }
    }

    if (cleanup.companies) {
      for (const companyId of cleanup.companies) {
        await deleteCompanyWithRelatedData(prisma, companyId).catch(() => {});
      }
    }

    if (cleanup.users) {
      await deleteUsersWithRelatedData(prisma, cleanup.users);
    }
  } catch (error) {
    console.error("Cleanup error:", error);
    // Don't throw - cleanup failures shouldn't break the test suite
  }
}
