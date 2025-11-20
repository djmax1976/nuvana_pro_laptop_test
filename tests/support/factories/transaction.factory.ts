/**
 * Transaction Test Data Factories
 *
 * Pure functions for generating test data related to transaction models:
 * - Transaction, TransactionLineItem, TransactionPayment
 * Uses faker for dynamic values to prevent collisions in parallel tests.
 *
 * Story 3.1: Transaction Data Models
 */

import { faker } from "@faker-js/faker";
import { Decimal } from "@prisma/client/runtime/library";
import {
  generatePublicId,
  PUBLIC_ID_PREFIXES,
} from "../../../backend/src/utils/public-id";

// Type definitions for transaction data

export type TransactionData = {
  public_id?: string;
  store_id: string;
  shift_id: string;
  cashier_id: string;
  pos_terminal_id?: string | null;
  timestamp?: Date;
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
};

export type TransactionLineItemData = {
  transaction_id: string;
  product_id?: string | null;
  sku?: string | null;
  name: string;
  quantity: number;
  unit_price: number;
  discount: number;
  line_total: number;
};

export type TransactionPaymentData = {
  transaction_id: string;
  method: "CASH" | "CREDIT" | "DEBIT" | "EBT" | "OTHER";
  amount: number;
  reference?: string | null;
};

/**
 * Creates a Transaction test data object
 */
export const createTransaction = (
  overrides: Partial<TransactionData> = {},
): TransactionData => {
  const subtotal =
    overrides.subtotal ?? Number(faker.commerce.price({ min: 10, max: 500 }));
  const tax = overrides.tax ?? Number((subtotal * 0.08).toFixed(2));
  const discount = overrides.discount ?? 0;
  const total =
    overrides.total ?? Number((subtotal + tax - discount).toFixed(2));

  return {
    public_id: generatePublicId(PUBLIC_ID_PREFIXES.TRANSACTION),
    store_id: faker.string.uuid(),
    shift_id: faker.string.uuid(),
    cashier_id: faker.string.uuid(),
    pos_terminal_id: null,
    timestamp: new Date(),
    subtotal,
    tax,
    discount,
    total,
    ...overrides,
  };
};

/**
 * Creates a TransactionLineItem test data object
 */
export const createTransactionLineItem = (
  overrides: Partial<TransactionLineItemData> = {},
): TransactionLineItemData => {
  const quantity = overrides.quantity ?? faker.number.int({ min: 1, max: 10 });
  const unit_price =
    overrides.unit_price ?? Number(faker.commerce.price({ min: 1, max: 100 }));
  const discount = overrides.discount ?? 0;
  const line_total =
    overrides.line_total ??
    Number((quantity * unit_price - discount).toFixed(2));

  return {
    transaction_id: faker.string.uuid(),
    product_id: null,
    sku: faker.string.alphanumeric(10).toUpperCase(),
    name: faker.commerce.productName(),
    quantity,
    unit_price,
    discount,
    line_total,
    ...overrides,
  };
};

/**
 * Creates a TransactionPayment test data object
 */
export const createTransactionPayment = (
  overrides: Partial<TransactionPaymentData> = {},
): TransactionPaymentData => {
  const methods: TransactionPaymentData["method"][] = [
    "CASH",
    "CREDIT",
    "DEBIT",
    "EBT",
    "OTHER",
  ];

  return {
    transaction_id: faker.string.uuid(),
    method: faker.helpers.arrayElement(methods),
    amount: Number(faker.commerce.price({ min: 10, max: 500 })),
    reference:
      overrides.method === "CREDIT" || overrides.method === "DEBIT"
        ? faker.string.numeric(4)
        : null,
    ...overrides,
  };
};

/**
 * Creates multiple Transaction test data objects
 */
export const createTransactions = (
  count: number,
  overrides: Partial<TransactionData> = {},
): TransactionData[] =>
  Array.from({ length: count }, () => createTransaction(overrides));

/**
 * Creates multiple TransactionLineItem test data objects
 */
export const createTransactionLineItems = (
  count: number,
  transactionId: string,
  overrides: Partial<TransactionLineItemData> = {},
): TransactionLineItemData[] =>
  Array.from({ length: count }, () =>
    createTransactionLineItem({ transaction_id: transactionId, ...overrides }),
  );

/**
 * Creates multiple TransactionPayment test data objects
 */
export const createTransactionPayments = (
  count: number,
  transactionId: string,
  overrides: Partial<TransactionPaymentData> = {},
): TransactionPaymentData[] =>
  Array.from({ length: count }, () =>
    createTransactionPayment({ transaction_id: transactionId, ...overrides }),
  );

/**
 * Creates a complete transaction with line items and payment
 * Useful for integration tests
 */
/**
 * Transaction API Payload type for POST /api/transactions
 * Story 3.2: Transaction Import API
 */
export type TransactionPayloadData = {
  store_id: string;
  shift_id: string;
  cashier_id?: string;
  pos_terminal_id?: string;
  timestamp?: string;
  subtotal: number;
  tax: number;
  discount: number;
  total?: number;
  line_items: {
    product_id?: string;
    sku: string;
    name: string;
    quantity: number;
    unit_price: number;
    discount?: number;
  }[];
  payments: {
    method: "CASH" | "CREDIT" | "DEBIT" | "EBT" | "OTHER";
    amount: number;
    reference?: string;
  }[];
};

/**
 * Creates a Transaction API payload for POST /api/transactions
 * Story 3.2: Transaction Import API
 */
export const createTransactionPayload = (
  overrides: Partial<TransactionPayloadData> = {},
): TransactionPayloadData => {
  // Generate line items
  const lineItemCount = 2;
  const line_items =
    overrides.line_items ??
    Array.from({ length: lineItemCount }, () => {
      const quantity = faker.number.int({ min: 1, max: 5 });
      const unit_price = Number(faker.commerce.price({ min: 5, max: 50 }));
      return {
        sku: faker.string.alphanumeric(10).toUpperCase(),
        name: faker.commerce.productName(),
        quantity,
        unit_price,
        discount: 0,
      };
    });

  // Calculate totals
  const subtotal =
    overrides.subtotal ??
    line_items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
  const tax = overrides.tax ?? Number((subtotal * 0.08).toFixed(2));
  const discount = overrides.discount ?? 0;
  const total =
    overrides.total ?? Number((subtotal + tax - discount).toFixed(2));

  // Generate payment to cover total
  const payments = overrides.payments ?? [
    {
      method: "CASH" as const,
      amount: total,
    },
  ];

  return {
    store_id: faker.string.uuid(),
    shift_id: faker.string.uuid(),
    subtotal,
    tax,
    discount,
    total,
    line_items,
    payments,
    ...overrides,
  };
};

export const createFullTransaction = (
  overrides: {
    transaction?: Partial<TransactionData>;
    lineItemCount?: number;
    paymentCount?: number;
  } = {},
) => {
  const lineItemCount = overrides.lineItemCount ?? 2;

  // Calculate subtotal from line items
  const lineItems = Array.from({ length: lineItemCount }, () => {
    const quantity = faker.number.int({ min: 1, max: 5 });
    const unit_price = Number(faker.commerce.price({ min: 5, max: 50 }));
    const line_total = quantity * unit_price;
    return createTransactionLineItem({
      quantity,
      unit_price,
      line_total,
    });
  });

  const subtotal = lineItems.reduce((sum, item) => sum + item.line_total, 0);
  const tax = Number((subtotal * 0.08).toFixed(2));
  const total = subtotal + tax;

  const transaction = createTransaction({
    subtotal,
    tax,
    discount: 0,
    total,
    ...overrides.transaction,
  });

  const payments = [
    createTransactionPayment({
      amount: total,
      method: "CASH",
    }),
  ];

  return {
    transaction,
    lineItems,
    payments,
  };
};
