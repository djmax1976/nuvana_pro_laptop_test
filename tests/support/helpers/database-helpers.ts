/**
 * Database Helper Functions
 *
 * Helper functions that create entities directly in the database using Prisma.
 * These wrap the factory functions and handle the database creation.
 */

import { PrismaClient } from "@prisma/client";
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
import {
  generatePublicId,
  PUBLIC_ID_PREFIXES,
} from "../../../backend/src/utils/public-id";

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

  if (prismaOrOverrides instanceof PrismaClient) {
    // Pattern: createUser(prisma, overrides)
    prismaClient = prismaOrOverrides;
    userOverrides = overrides || {};
  } else {
    // Pattern: createUser(overrides)
    userOverrides = prismaOrOverrides;
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

  if (prismaOrOverrides instanceof PrismaClient) {
    // Pattern: createCompany(prisma, overrides)
    prismaClient = prismaOrOverrides;
    companyOverrides = overrides || {};
  } else {
    // Pattern: createCompany(overrides)
    companyOverrides = prismaOrOverrides;
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

  if (prismaOrOverrides instanceof PrismaClient) {
    // Pattern: createStore(prisma, overrides)
    prismaClient = prismaOrOverrides;
    storeOverrides = overrides || {};
  } else {
    // Pattern: createStore(overrides)
    storeOverrides = prismaOrOverrides;
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
 * Create a shift in the database
 * If prisma is not provided, creates a new PrismaClient instance
 */
export async function createShift(
  overrides: {
    store_id: string;
    cashier_id?: string;
    start_time: Date;
    end_time?: Date | null;
    status?: string;
    opening_amount?: number;
    closing_amount?: number | null;
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

  // Create a cashier user if not provided
  let cashierId = overrides.cashier_id;
  if (!cashierId) {
    const cashier = await createUser(prismaClient, {});
    cashierId = cashier.user_id;
  }

  const result = await prismaClient.shift.create({
    data: {
      store_id: overrides.store_id,
      cashier_id: cashierId,
      start_time: overrides.start_time,
      end_time: overrides.end_time ?? null,
      status: overrides.status ?? "OPEN",
      opening_amount: overrides.opening_amount ?? 0,
      closing_amount: overrides.closing_amount ?? null,
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
