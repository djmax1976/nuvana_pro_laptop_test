/**
 * Transaction Validation Schemas
 *
 * Zod schemas for validating transaction API payloads.
 * Story 3.2: Transaction Import API
 */

import { z } from "zod";

/**
 * Payment method enum values
 */
export const PaymentMethodEnum = z.enum([
  "CASH",
  "CREDIT",
  "DEBIT",
  "EBT",
  "OTHER",
]);

/**
 * Transaction Line Item Schema
 * Validates individual line items in a transaction
 */
export const TransactionLineItemSchema = z.object({
  product_id: z.string().uuid().optional(),
  sku: z.string().min(1, "SKU is required"),
  name: z.string().min(1, "Product name is required"),
  quantity: z.number().int().positive("Quantity must be a positive integer"),
  unit_price: z.number().nonnegative("Unit price must be non-negative"),
  discount: z.number().nonnegative("Discount must be non-negative").default(0),
});

/**
 * Transaction Payment Schema
 * Validates payment information in a transaction
 */
export const TransactionPaymentSchema = z.object({
  method: PaymentMethodEnum,
  amount: z.number().positive("Payment amount must be positive"),
  reference: z.string().optional(),
});

/**
 * Transaction Payload Schema
 * Validates the complete transaction payload for POST /api/transactions
 */
export const TransactionPayloadSchema = z
  .object({
    store_id: z.string().uuid("store_id must be a valid UUID"),
    shift_id: z.string().uuid("shift_id must be a valid UUID"),
    cashier_id: z.string().uuid("cashier_id must be a valid UUID").optional(),
    pos_terminal_id: z
      .string()
      .uuid("pos_terminal_id must be a valid UUID")
      .optional(),
    timestamp: z.string().datetime().optional(),
    subtotal: z.number().nonnegative("Subtotal must be non-negative"),
    tax: z.number().nonnegative("Tax must be non-negative").default(0),
    discount: z
      .number()
      .nonnegative("Discount must be non-negative")
      .default(0),
    line_items: z
      .array(TransactionLineItemSchema)
      .min(1, "At least one line item is required"),
    payments: z
      .array(TransactionPaymentSchema)
      .min(1, "At least one payment is required"),
  })
  .refine(
    (data) => {
      // Calculate transaction total
      const transactionTotal = data.subtotal + data.tax - data.discount;
      // Calculate payment total
      const paymentTotal = data.payments.reduce(
        (sum, payment) => sum + payment.amount,
        0,
      );
      // Payment total must be >= transaction total
      return paymentTotal >= transactionTotal;
    },
    {
      message:
        "Payment total must equal or exceed transaction total (subtotal + tax - discount)",
      path: ["payments"],
    },
  );

/**
 * Type inference from schemas
 */
export type TransactionLineItemPayload = z.infer<
  typeof TransactionLineItemSchema
>;
export type TransactionPaymentPayload = z.infer<
  typeof TransactionPaymentSchema
>;
export type TransactionPayload = z.infer<typeof TransactionPayloadSchema>;

/**
 * Validate transaction payload and return typed result
 * @param data - Raw payload data
 * @returns Validated and typed transaction payload
 * @throws ZodError if validation fails
 */
export function validateTransactionPayload(data: unknown): TransactionPayload {
  return TransactionPayloadSchema.parse(data);
}

/**
 * Safe validation that returns result object instead of throwing
 * @param data - Raw payload data
 * @returns SafeParseResult with success flag and data/error
 */
export function safeValidateTransactionPayload(data: unknown) {
  return TransactionPayloadSchema.safeParse(data);
}
