/**
 * Database Helper Functions
 *
 * Helper functions that create entities directly in the database using Prisma.
 * These wrap the factory functions and handle the database creation.
 */

import { PrismaClient, ShiftStatus } from "@prisma/client";
import {
  createUser as createUserFactory,
  createCompany as createCompanyFactory,
  createStore as createStoreFactory,
  type UserData,
  type CompanyData,
  type StoreData,
} from "../factories/database.factory";
import {
  createTransaction as createTransactionFactory,
  type TransactionData,
} from "../factories/transaction.factory";
import { createCashier as createCashierFactory } from "../factories/cashier.factory";
import {
  generatePublicId,
  PUBLIC_ID_PREFIXES,
} from "../../../backend/src/utils/public-id";

/**
 * Helper to check if an object is a PrismaClient using duck-typing.
 *
 * WHY NOT instanceof?
 * Prisma Client uses Proxy objects with custom Symbol.toStringTag getters.
 * When Node.js's `instanceof` operator triggers internal inspection (via
 * util.inspect or similar), it can cause infinite recursion due to Prisma's
 * proxy structure, resulting in "RangeError: Maximum call stack size exceeded".
 *
 * This is a known Prisma issue:
 * - https://github.com/prisma/prisma/issues/25798
 * - https://github.com/prisma/prisma/issues/17236
 *
 * SOLUTION: Use duck-typing to check for Prisma-specific methods/properties
 * without triggering serialization or inspection.
 *
 * @see https://github.com/prisma/prisma/issues/25798
 */
function isPrismaClient(obj: unknown): obj is PrismaClient {
  if (obj === null || typeof obj !== "object") {
    return false;
  }

  // Check for Prisma Client's characteristic methods and model delegates
  // These are always present on a PrismaClient instance
  const hasPrismaMethods =
    "$connect" in obj &&
    "$disconnect" in obj &&
    "$transaction" in obj &&
    typeof (obj as Record<string, unknown>).$connect === "function";

  // Check for model delegates (our schema's models)
  const hasModelDelegates = "user" in obj && "company" in obj && "store" in obj;

  return hasPrismaMethods && hasModelDelegates;
}

/**
 * Create a user in the database
 * Supports both patterns:
 * - createUser(prisma, overrides) - prisma first (for existing code)
 * - createUser(overrides) - prisma optional, creates new instance
 */
export async function createUser(
  prismaOrOverrides: PrismaClient | Partial<UserData>,
  overrides?: Partial<UserData>,
): Promise<{
  user_id: string;
  email: string;
  name: string;
  [key: string]: any;
}> {
  let prismaClient: PrismaClient | undefined;
  let userOverrides: Partial<UserData>;

  // Use duck-typing check instead of instanceof to avoid Prisma's
  // internal serialization which can cause stack overflow
  if (isPrismaClient(prismaOrOverrides)) {
    // Pattern: createUser(prisma, overrides)
    prismaClient = prismaOrOverrides;
    userOverrides = overrides || {};
  } else {
    // Pattern: createUser(overrides)
    userOverrides = prismaOrOverrides as Partial<UserData>;
    prismaClient = undefined;
  }

  const client = prismaClient || new PrismaClient();
  const userData = createUserFactory(userOverrides);
  const result = await client.user.create({ data: userData });
  if (!prismaClient) await client.$disconnect();
  return result;
}

/**
 * Create a company in the database
 * If owner_user_id is not provided, creates an owner user automatically
 * Supports both patterns:
 * - createCompany(prisma, overrides) - prisma first (for existing code)
 * - createCompany(overrides) - prisma optional, creates new instance
 */
export async function createCompany(
  prismaOrOverrides: PrismaClient | Partial<CompanyData>,
  overrides?: Partial<CompanyData>,
): Promise<{
  company_id: string;
  name: string;
  owner_user_id: string;
  [key: string]: any;
}> {
  let prismaClient: PrismaClient | undefined;
  let companyOverrides: Partial<CompanyData>;

  // Use duck-typing check instead of instanceof to avoid Prisma's
  // internal serialization which can cause stack overflow
  if (isPrismaClient(prismaOrOverrides)) {
    // Pattern: createCompany(prisma, overrides)
    prismaClient = prismaOrOverrides;
    companyOverrides = overrides || {};
  } else {
    // Pattern: createCompany(overrides)
    companyOverrides = prismaOrOverrides as Partial<CompanyData>;
    prismaClient = undefined;
  }

  const client = prismaClient || new PrismaClient();

  // If owner_user_id is not provided, create an owner user
  if (!companyOverrides.owner_user_id) {
    const owner = await createUser(client, { name: "Company Owner" });
    companyOverrides.owner_user_id = owner.user_id;
  }

  const companyData = createCompanyFactory(
    companyOverrides as Partial<CompanyData> & { owner_user_id: string },
  );
  const result = await client.company.create({ data: companyData });
  if (!prismaClient) await client.$disconnect();
  return result;
}

/**
 * Create a store in the database
 * Supports both patterns:
 * - createStore(prisma, overrides) - prisma first (for existing code)
 * - createStore(overrides) - prisma optional, creates new instance
 * If company_id is not provided, creates a company with an owner user
 */
export async function createStore(
  prismaOrOverrides:
    | PrismaClient
    | (Partial<StoreData> & { company_id?: string }),
  overrides?: Partial<StoreData> & { company_id?: string },
): Promise<{
  store_id: string;
  name: string;
  company_id: string;
  [key: string]: any;
}> {
  let prismaClient: PrismaClient | undefined;
  let storeOverrides: Partial<StoreData> & { company_id?: string };

  // Use duck-typing check instead of instanceof to avoid Prisma's
  // internal serialization which can cause stack overflow
  if (isPrismaClient(prismaOrOverrides)) {
    // Pattern: createStore(prisma, overrides)
    prismaClient = prismaOrOverrides;
    storeOverrides = overrides || {};
  } else {
    // Pattern: createStore(overrides)
    storeOverrides = prismaOrOverrides as Partial<StoreData> & {
      company_id?: string;
    };
    prismaClient = undefined;
  }

  const client = prismaClient || new PrismaClient();

  let companyId = storeOverrides.company_id;
  if (!companyId) {
    const company = await createCompany(client, {});
    companyId = company.company_id;
  }

  const storeData = createStoreFactory({
    ...storeOverrides,
    company_id: companyId,
  });
  const result = await client.store.create({ data: storeData });
  if (!prismaClient) await client.$disconnect();
  return result;
}

/**
 * Create a cashier in the database
 * If prisma is not provided, creates a new PrismaClient instance
 *
 * @param overrides - Requires store_id and created_by (user_id of creator)
 * @param prisma - Optional PrismaClient instance
 * @returns Created cashier with cashier_id
 */
export async function createCashier(
  overrides: {
    store_id: string;
    created_by: string;
    name?: string;
    employee_id?: string;
    pin?: string;
  },
  prisma?: PrismaClient,
): Promise<{
  cashier_id: string;
  store_id: string;
  employee_id: string;
  name: string;
  [key: string]: any;
}> {
  const prismaClient = prisma || new PrismaClient();

  // Only include optional fields if they are defined to avoid overriding defaults with undefined
  const factoryOverrides: {
    store_id: string;
    created_by: string;
    name?: string;
    employee_id?: string;
    pin?: string;
  } = {
    store_id: overrides.store_id,
    created_by: overrides.created_by,
  };

  if (overrides.name !== undefined) {
    factoryOverrides.name = overrides.name;
  }
  if (overrides.employee_id !== undefined) {
    factoryOverrides.employee_id = overrides.employee_id;
  }
  if (overrides.pin !== undefined) {
    factoryOverrides.pin = overrides.pin;
  }

  const cashierData = await createCashierFactory(factoryOverrides);

  const result = await prismaClient.cashier.create({ data: cashierData });

  if (!prisma) await prismaClient.$disconnect();
  return result;
}

/**
 * Create a shift in the database
 * If prisma is not provided, creates a new PrismaClient instance
 *
 * IMPORTANT: cashier_id must reference the cashiers table (not users table).
 * If cashier_id is not provided, this function will create a real Cashier entity.
 */
export async function createShift(
  overrides: {
    store_id: string;
    opened_by?: string;
    cashier_id?: string;
    opened_at?: Date;
    closed_at?: Date | null;
    status?: ShiftStatus;
    opening_cash?: number;
    closing_cash?: number | null;
    pos_terminal_id?: string | null;
  },
  prisma?: PrismaClient,
): Promise<{
  shift_id: string;
  store_id: string;
  cashier_id: string;
  [key: string]: any;
}> {
  const prismaClient = prisma || new PrismaClient();

  // Create an opener user if not provided (this is a User, required for opened_by)
  let openedById = overrides.opened_by;
  if (!openedById) {
    const opener = await createUser(prismaClient, {});
    openedById = opener.user_id;
  }

  // Create a Cashier entity if not provided
  // IMPORTANT: shifts.cashier_id is a FK to cashiers table, NOT users table
  let cashierId = overrides.cashier_id;
  if (!cashierId) {
    const cashierData = await createCashierFactory({
      store_id: overrides.store_id,
      created_by: openedById,
    });
    const cashier = await prismaClient.cashier.create({ data: cashierData });
    cashierId = cashier.cashier_id;
  }

  const result = await prismaClient.shift.create({
    data: {
      store_id: overrides.store_id,
      opened_by: openedById,
      cashier_id: cashierId,
      opened_at: overrides.opened_at ?? new Date(),
      closed_at: overrides.closed_at ?? null,
      status: overrides.status ?? ShiftStatus.OPEN,
      opening_cash: overrides.opening_cash ?? 0,
      closing_cash: overrides.closing_cash ?? null,
      pos_terminal_id: overrides.pos_terminal_id ?? null,
      public_id: generatePublicId(PUBLIC_ID_PREFIXES.SHIFT),
    },
  });

  if (!prisma) await prismaClient.$disconnect();
  return result;
}

/**
 * Create a transaction in the database
 * If prisma is not provided, creates a new PrismaClient instance
 */
export async function createTransaction(
  overrides: {
    store_id: string;
    shift_id: string;
    cashier_id?: string;
    timestamp: Date;
    subtotal?: number;
    tax?: number;
    discount?: number;
    total?: number;
    total_amount?: number; // Alias for total for backward compatibility
    pos_terminal_id?: string | null;
  },
  prisma?: PrismaClient,
): Promise<{
  transaction_id: string;
  store_id: string;
  shift_id: string;
  [key: string]: any;
}> {
  const prismaClient = prisma || new PrismaClient();

  // Create a cashier user if not provided
  let cashierId = overrides.cashier_id;
  if (!cashierId) {
    const cashier = await createUser(prismaClient, {});
    cashierId = cashier.user_id;
  }

  const total = overrides.total ?? overrides.total_amount ?? 0;
  const subtotal = overrides.subtotal ?? total;
  const tax = overrides.tax ?? 0;
  const discount = overrides.discount ?? 0;

  const transactionData = createTransactionFactory({
    store_id: overrides.store_id,
    shift_id: overrides.shift_id,
    cashier_id: cashierId,
    timestamp: overrides.timestamp,
    subtotal,
    tax,
    discount,
    total,
    pos_terminal_id: overrides.pos_terminal_id ?? null,
  });

  const result = await prismaClient.transaction.create({
    data: transactionData,
  });

  if (!prisma) await prismaClient.$disconnect();
  return result;
}

/**
 * Calculate the next expected employee_id for a store
 *
 * This helper queries the maximum existing employee_id for a store (ignoring
 * soft-deleted rows) and calculates the next sequential employee_id.
 *
 * This is more reliable than counting cashiers because:
 * - It ignores soft-deleted rows (disabled_at IS NOT NULL)
 * - It handles gaps in employee_id sequences
 * - It's not affected by parallel tests or leftover records
 *
 * @param storeId - Store UUID
 * @param offset - Optional offset from the next employee_id (default: 0)
 *                 offset=0 returns the next employee_id
 *                 offset=1 returns the employee_id after the next one
 * @param prismaClient - Prisma client instance
 * @returns Next expected employee_id (4-digit zero-padded string)
 */
export async function getNextExpectedEmployeeId(
  storeId: string,
  offset: number = 0,
  prismaClient?: PrismaClient,
): Promise<string> {
  const client = prismaClient || new PrismaClient();

  try {
    // Query max employee_id for this store, ignoring soft-deleted rows
    const maxCashier = await client.cashier.findFirst({
      where: {
        store_id: storeId,
        disabled_at: null, // Only active (non-soft-deleted) cashiers
      },
      orderBy: { employee_id: "desc" },
      select: { employee_id: true },
    });

    let nextNumber = 1;
    if (maxCashier) {
      // Parse the numeric portion of the employee_id
      const currentNumber = parseInt(maxCashier.employee_id, 10);
      if (!isNaN(currentNumber)) {
        nextNumber = currentNumber + 1 + offset;
      }
    } else {
      // No existing cashiers, start at 1 + offset
      nextNumber = 1 + offset;
    }

    // Zero-pad to 4 digits
    return nextNumber.toString().padStart(4, "0");
  } finally {
    if (!prismaClient) await client.$disconnect();
  }
}
