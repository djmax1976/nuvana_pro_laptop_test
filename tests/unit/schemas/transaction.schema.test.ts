import { describe, it, expect } from "vitest";
import {
  TransactionPayloadSchema,
  TransactionLineItemSchema,
  TransactionPaymentSchema,
  PaymentMethodEnum,
  validateTransactionPayload,
  safeValidateTransactionPayload,
} from "../../../backend/src/schemas/transaction.schema";

/**
 * Unit Tests: Transaction Zod Schemas - Story 3.3
 *
 * Tests validation logic for transaction schemas from:
 * - Backend: backend/src/schemas/transaction.schema.ts
 *
 * These are UNIT tests - they test the schema validation logic in isolation
 * without any database, HTTP, RabbitMQ, or browser interaction.
 *
 * Fast: Each test runs in <10ms
 * Purpose: Verify validation rules catch invalid data before it reaches the API
 *
 * Test Categories:
 * - TransactionPayloadSchema validation
 * - TransactionLineItemSchema validation
 * - TransactionPaymentSchema validation
 * - Business rule validation (payment total >= transaction total)
 * - Edge cases (boundary values, special characters)
 * - Security (SQL injection patterns stored safely)
 */

// =============================================================================
// SECTION 1: TRANSACTION PAYLOAD - REQUIRED FIELDS
// =============================================================================

describe("TransactionPayloadSchema - Required Fields", () => {
  const validPayload = {
    store_id: "550e8400-e29b-41d4-a716-446655440000",
    shift_id: "550e8400-e29b-41d4-a716-446655440001",
    subtotal: 100.0,
    line_items: [
      {
        sku: "SKU-001",
        name: "Test Item",
        quantity: 1,
        unit_price: 100.0,
        discount: 0,
      },
    ],
    payments: [{ method: "CASH" as const, amount: 108.0 }],
  };

  it("should accept valid complete payload", () => {
    const result = TransactionPayloadSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
  });

  it("should reject missing store_id", () => {
    const { store_id, ...payload } = validPayload;
    const result = TransactionPayloadSchema.safeParse(payload);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes("store_id"))).toBe(
        true,
      );
    }
  });

  it("should reject missing shift_id", () => {
    const { shift_id, ...payload } = validPayload;
    const result = TransactionPayloadSchema.safeParse(payload);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes("shift_id"))).toBe(
        true,
      );
    }
  });

  it("should reject missing subtotal", () => {
    const { subtotal, ...payload } = validPayload;
    const result = TransactionPayloadSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it("should reject missing line_items", () => {
    const { line_items, ...payload } = validPayload;
    const result = TransactionPayloadSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it("should reject missing payments", () => {
    const { payments, ...payload } = validPayload;
    const result = TransactionPayloadSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });
});

// =============================================================================
// SECTION 2: UUID VALIDATION
// =============================================================================

describe("TransactionPayloadSchema - UUID Validation", () => {
  const basePayload = {
    subtotal: 100.0,
    line_items: [
      {
        sku: "SKU-001",
        name: "Test Item",
        quantity: 1,
        unit_price: 100.0,
        discount: 0,
      },
    ],
    payments: [{ method: "CASH" as const, amount: 108.0 }],
  };

  it("should accept valid UUID for store_id", () => {
    const payload = {
      ...basePayload,
      store_id: "550e8400-e29b-41d4-a716-446655440000",
      shift_id: "550e8400-e29b-41d4-a716-446655440001",
    };
    const result = TransactionPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it("should reject invalid UUID format for store_id", () => {
    const invalidUUIDs = [
      "not-a-uuid",
      "12345",
      "",
      "550e8400-e29b-41d4-a716", // too short
      "550e8400-e29b-41d4-a716-446655440000-extra", // too long
      "GGGGGGGG-GGGG-GGGG-GGGG-GGGGGGGGGGGG", // invalid characters
    ];

    invalidUUIDs.forEach((uuid) => {
      const payload = {
        ...basePayload,
        store_id: uuid,
        shift_id: "550e8400-e29b-41d4-a716-446655440001",
      };
      const result = TransactionPayloadSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });
  });

  it("should reject invalid UUID format for shift_id", () => {
    const payload = {
      ...basePayload,
      store_id: "550e8400-e29b-41d4-a716-446655440000",
      shift_id: "invalid-shift-uuid",
    };
    const result = TransactionPayloadSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it("should accept valid UUID for optional cashier_id", () => {
    const payload = {
      ...basePayload,
      store_id: "550e8400-e29b-41d4-a716-446655440000",
      shift_id: "550e8400-e29b-41d4-a716-446655440001",
      cashier_id: "550e8400-e29b-41d4-a716-446655440002",
    };
    const result = TransactionPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it("should reject invalid UUID for optional cashier_id", () => {
    const payload = {
      ...basePayload,
      store_id: "550e8400-e29b-41d4-a716-446655440000",
      shift_id: "550e8400-e29b-41d4-a716-446655440001",
      cashier_id: "not-valid",
    };
    const result = TransactionPayloadSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });
});

// =============================================================================
// SECTION 3: NUMERIC FIELD VALIDATION
// =============================================================================

describe("TransactionPayloadSchema - Numeric Validation", () => {
  const createPayload = (overrides: Record<string, unknown>) => ({
    store_id: "550e8400-e29b-41d4-a716-446655440000",
    shift_id: "550e8400-e29b-41d4-a716-446655440001",
    subtotal: 100.0,
    tax: 8.0,
    discount: 0,
    line_items: [
      {
        sku: "SKU-001",
        name: "Test Item",
        quantity: 1,
        unit_price: 100.0,
        discount: 0,
      },
    ],
    payments: [{ method: "CASH" as const, amount: 108.0 }],
    ...overrides,
  });

  it("should accept zero subtotal", () => {
    const payload = createPayload({
      subtotal: 0,
      payments: [{ method: "CASH", amount: 8.0 }],
    });
    const result = TransactionPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it("should reject negative subtotal", () => {
    const payload = createPayload({ subtotal: -50.0 });
    const result = TransactionPayloadSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it("should accept zero tax (default)", () => {
    const payload = createPayload({ tax: 0 });
    const result = TransactionPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it("should reject negative tax", () => {
    const payload = createPayload({ tax: -5.0 });
    const result = TransactionPayloadSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it("should accept zero discount (default)", () => {
    const payload = createPayload({ discount: 0 });
    const result = TransactionPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it("should reject negative discount", () => {
    const payload = createPayload({ discount: -10.0 });
    const result = TransactionPayloadSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it("should accept high precision decimals", () => {
    const payload = createPayload({
      subtotal: 99.999,
      tax: 7.9992,
      payments: [{ method: "CASH", amount: 107.9982 }],
    });
    const result = TransactionPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it("should accept very large subtotal", () => {
    const payload = createPayload({
      subtotal: 999999.99,
      payments: [{ method: "CASH", amount: 1000007.99 }],
    });
    const result = TransactionPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });
});

// =============================================================================
// SECTION 4: LINE ITEMS VALIDATION
// =============================================================================

describe("TransactionLineItemSchema - Validation", () => {
  it("should accept valid line item", () => {
    const item = {
      sku: "SKU-001",
      name: "Test Product",
      quantity: 1,
      unit_price: 25.99,
      discount: 0,
    };
    const result = TransactionLineItemSchema.safeParse(item);
    expect(result.success).toBe(true);
  });

  it("should accept line item with optional product_id", () => {
    const item = {
      product_id: "550e8400-e29b-41d4-a716-446655440000",
      sku: "SKU-001",
      name: "Test Product",
      quantity: 1,
      unit_price: 25.99,
      discount: 0,
    };
    const result = TransactionLineItemSchema.safeParse(item);
    expect(result.success).toBe(true);
  });

  it("should reject empty SKU", () => {
    const item = {
      sku: "",
      name: "Test Product",
      quantity: 1,
      unit_price: 25.99,
      discount: 0,
    };
    const result = TransactionLineItemSchema.safeParse(item);
    expect(result.success).toBe(false);
  });

  it("should reject empty name", () => {
    const item = {
      sku: "SKU-001",
      name: "",
      quantity: 1,
      unit_price: 25.99,
      discount: 0,
    };
    const result = TransactionLineItemSchema.safeParse(item);
    expect(result.success).toBe(false);
  });

  it("should reject zero quantity", () => {
    const item = {
      sku: "SKU-001",
      name: "Test Product",
      quantity: 0,
      unit_price: 25.99,
      discount: 0,
    };
    const result = TransactionLineItemSchema.safeParse(item);
    expect(result.success).toBe(false);
  });

  it("should reject negative quantity", () => {
    const item = {
      sku: "SKU-001",
      name: "Test Product",
      quantity: -1,
      unit_price: 25.99,
      discount: 0,
    };
    const result = TransactionLineItemSchema.safeParse(item);
    expect(result.success).toBe(false);
  });

  it("should reject non-integer quantity", () => {
    const item = {
      sku: "SKU-001",
      name: "Test Product",
      quantity: 1.5,
      unit_price: 25.99,
      discount: 0,
    };
    const result = TransactionLineItemSchema.safeParse(item);
    expect(result.success).toBe(false);
  });

  it("should accept zero unit_price (free item)", () => {
    const item = {
      sku: "FREE-001",
      name: "Free Sample",
      quantity: 1,
      unit_price: 0,
      discount: 0,
    };
    const result = TransactionLineItemSchema.safeParse(item);
    expect(result.success).toBe(true);
  });

  it("should reject negative unit_price", () => {
    const item = {
      sku: "SKU-001",
      name: "Test Product",
      quantity: 1,
      unit_price: -25.99,
      discount: 0,
    };
    const result = TransactionLineItemSchema.safeParse(item);
    expect(result.success).toBe(false);
  });

  it("should accept special characters in name (unicode)", () => {
    const item = {
      sku: "CAFE-001",
      name: "Café Latté - 12oz (Hot) 咖啡 ☕️ & Croissant",
      quantity: 1,
      unit_price: 8.5,
      discount: 0,
    };
    const result = TransactionLineItemSchema.safeParse(item);
    expect(result.success).toBe(true);
  });

  it("should accept SQL injection pattern as literal string (Prisma will sanitize)", () => {
    const item = {
      sku: "'; DROP TABLE transactions; --",
      name: "Test'; DELETE FROM users WHERE '1'='1",
      quantity: 1,
      unit_price: 10.0,
      discount: 0,
    };
    const result = TransactionLineItemSchema.safeParse(item);
    // Schema accepts any string - SQL injection prevention is at the ORM layer
    expect(result.success).toBe(true);
  });
});

// =============================================================================
// SECTION 5: LINE ITEMS ARRAY VALIDATION
// =============================================================================

describe("TransactionPayloadSchema - Line Items Array", () => {
  const createPayload = (line_items: unknown[]) => ({
    store_id: "550e8400-e29b-41d4-a716-446655440000",
    shift_id: "550e8400-e29b-41d4-a716-446655440001",
    subtotal: 100.0,
    line_items,
    payments: [{ method: "CASH" as const, amount: 108.0 }],
  });

  it("should reject empty line_items array", () => {
    const payload = createPayload([]);
    const result = TransactionPayloadSchema.safeParse(payload);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain(
        "At least one line item",
      );
    }
  });

  it("should accept single line item", () => {
    const payload = createPayload([
      {
        sku: "SKU-001",
        name: "Test",
        quantity: 1,
        unit_price: 100.0,
        discount: 0,
      },
    ]);
    const result = TransactionPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it("should accept multiple line items", () => {
    const payload = createPayload([
      {
        sku: "SKU-001",
        name: "Item 1",
        quantity: 1,
        unit_price: 50.0,
        discount: 0,
      },
      {
        sku: "SKU-002",
        name: "Item 2",
        quantity: 2,
        unit_price: 25.0,
        discount: 0,
      },
    ]);
    const result = TransactionPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it("should accept 100 line items", () => {
    const items = Array.from({ length: 100 }, (_, i) => ({
      sku: `SKU-${i.toString().padStart(3, "0")}`,
      name: `Item ${i}`,
      quantity: 1,
      unit_price: 1.0,
      discount: 0,
    }));
    const payload = createPayload(items);
    payload.subtotal = 100.0;
    const result = TransactionPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });
});

// =============================================================================
// SECTION 6: PAYMENT VALIDATION
// =============================================================================

describe("TransactionPaymentSchema - Validation", () => {
  it("should accept valid CASH payment", () => {
    const payment = { method: "CASH", amount: 100.0 };
    const result = TransactionPaymentSchema.safeParse(payment);
    expect(result.success).toBe(true);
  });

  it("should accept valid CREDIT payment with reference", () => {
    const payment = {
      method: "CREDIT",
      amount: 100.0,
      reference: "AUTH-12345",
    };
    const result = TransactionPaymentSchema.safeParse(payment);
    expect(result.success).toBe(true);
  });

  it("should accept all valid payment methods", () => {
    const methods = ["CASH", "CREDIT", "DEBIT", "EBT", "OTHER"] as const;
    methods.forEach((method) => {
      const payment = { method, amount: 50.0 };
      const result = TransactionPaymentSchema.safeParse(payment);
      expect(result.success).toBe(true);
    });
  });

  it("should reject invalid payment method", () => {
    const payment = { method: "BITCOIN", amount: 100.0 };
    const result = TransactionPaymentSchema.safeParse(payment);
    expect(result.success).toBe(false);
  });

  it("should reject zero payment amount", () => {
    const payment = { method: "CASH", amount: 0 };
    const result = TransactionPaymentSchema.safeParse(payment);
    expect(result.success).toBe(false);
  });

  it("should reject negative payment amount", () => {
    const payment = { method: "CASH", amount: -50.0 };
    const result = TransactionPaymentSchema.safeParse(payment);
    expect(result.success).toBe(false);
  });
});

// =============================================================================
// SECTION 7: PAYMENTS ARRAY VALIDATION
// =============================================================================

describe("TransactionPayloadSchema - Payments Array", () => {
  const createPayload = (payments: unknown[]) => ({
    store_id: "550e8400-e29b-41d4-a716-446655440000",
    shift_id: "550e8400-e29b-41d4-a716-446655440001",
    subtotal: 100.0,
    tax: 8.0,
    discount: 0,
    line_items: [
      {
        sku: "SKU-001",
        name: "Test",
        quantity: 1,
        unit_price: 100.0,
        discount: 0,
      },
    ],
    payments,
  });

  it("should reject empty payments array", () => {
    const payload = createPayload([]);
    const result = TransactionPayloadSchema.safeParse(payload);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("At least one payment");
    }
  });

  it("should accept single payment", () => {
    const payload = createPayload([{ method: "CASH", amount: 108.0 }]);
    const result = TransactionPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it("should accept split payments", () => {
    const payload = createPayload([
      { method: "CASH", amount: 50.0 },
      { method: "CREDIT", amount: 58.0, reference: "1234" },
    ]);
    const result = TransactionPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it("should accept all 5 payment methods combined", () => {
    const payload = createPayload([
      { method: "CASH", amount: 20.0 },
      { method: "CREDIT", amount: 25.0 },
      { method: "DEBIT", amount: 25.0 },
      { method: "EBT", amount: 20.0 },
      { method: "OTHER", amount: 18.0 },
    ]);
    const result = TransactionPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });
});

// =============================================================================
// SECTION 8: BUSINESS RULE - PAYMENT TOTAL >= TRANSACTION TOTAL
// =============================================================================

describe("TransactionPayloadSchema - Payment Total Business Rule", () => {
  const createPayload = (
    subtotal: number,
    tax: number,
    discount: number,
    paymentAmount: number,
  ) => ({
    store_id: "550e8400-e29b-41d4-a716-446655440000",
    shift_id: "550e8400-e29b-41d4-a716-446655440001",
    subtotal,
    tax,
    discount,
    line_items: [
      {
        sku: "SKU-001",
        name: "Test",
        quantity: 1,
        unit_price: subtotal,
        discount: 0,
      },
    ],
    payments: [{ method: "CASH" as const, amount: paymentAmount }],
  });

  it("should accept payment equal to transaction total", () => {
    // subtotal: 100, tax: 8, discount: 0 = total: 108
    const payload = createPayload(100, 8, 0, 108);
    const result = TransactionPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it("should accept overpayment (change scenario)", () => {
    // subtotal: 100, tax: 8, discount: 0 = total: 108, payment: 120
    const payload = createPayload(100, 8, 0, 120);
    const result = TransactionPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it("should reject underpayment", () => {
    // subtotal: 100, tax: 8, discount: 0 = total: 108, payment: 50
    const payload = createPayload(100, 8, 0, 50);
    const result = TransactionPayloadSchema.safeParse(payload);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain(
        "Payment total must equal or exceed",
      );
    }
  });

  it("should account for discount in total calculation", () => {
    // subtotal: 100, tax: 8, discount: 10 = total: 98, payment: 98
    const payload = createPayload(100, 8, 10, 98);
    const result = TransactionPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it("should accept split payments that sum to total", () => {
    const payload = {
      store_id: "550e8400-e29b-41d4-a716-446655440000",
      shift_id: "550e8400-e29b-41d4-a716-446655440001",
      subtotal: 100,
      tax: 8,
      discount: 0,
      line_items: [
        {
          sku: "SKU-001",
          name: "Test",
          quantity: 1,
          unit_price: 100,
          discount: 0,
        },
      ],
      payments: [
        { method: "CASH" as const, amount: 50 },
        { method: "CREDIT" as const, amount: 58 },
      ],
    };
    const result = TransactionPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it("should reject split payments that sum to less than total", () => {
    const payload = {
      store_id: "550e8400-e29b-41d4-a716-446655440000",
      shift_id: "550e8400-e29b-41d4-a716-446655440001",
      subtotal: 100,
      tax: 8,
      discount: 0,
      line_items: [
        {
          sku: "SKU-001",
          name: "Test",
          quantity: 1,
          unit_price: 100,
          discount: 0,
        },
      ],
      payments: [
        { method: "CASH" as const, amount: 30 },
        { method: "CREDIT" as const, amount: 30 },
      ],
    };
    const result = TransactionPayloadSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });
});

// =============================================================================
// SECTION 9: HELPER FUNCTION TESTS
// =============================================================================

describe("validateTransactionPayload - Helper Function", () => {
  const validPayload = {
    store_id: "550e8400-e29b-41d4-a716-446655440000",
    shift_id: "550e8400-e29b-41d4-a716-446655440001",
    subtotal: 100.0,
    line_items: [
      {
        sku: "SKU-001",
        name: "Test Item",
        quantity: 1,
        unit_price: 100.0,
        discount: 0,
      },
    ],
    payments: [{ method: "CASH" as const, amount: 108.0 }],
  };

  it("should return parsed payload for valid input", () => {
    const result = validateTransactionPayload(validPayload);
    expect(result.store_id).toBe(validPayload.store_id);
    expect(result.shift_id).toBe(validPayload.shift_id);
  });

  it("should throw ZodError for invalid input", () => {
    expect(() => validateTransactionPayload({ invalid: "data" })).toThrow();
  });
});

describe("safeValidateTransactionPayload - Helper Function", () => {
  const validPayload = {
    store_id: "550e8400-e29b-41d4-a716-446655440000",
    shift_id: "550e8400-e29b-41d4-a716-446655440001",
    subtotal: 100.0,
    line_items: [
      {
        sku: "SKU-001",
        name: "Test Item",
        quantity: 1,
        unit_price: 100.0,
        discount: 0,
      },
    ],
    payments: [{ method: "CASH" as const, amount: 108.0 }],
  };

  it("should return success: true for valid input", () => {
    const result = safeValidateTransactionPayload(validPayload);
    expect(result.success).toBe(true);
  });

  it("should return success: false with error for invalid input", () => {
    const result = safeValidateTransactionPayload({ invalid: "data" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeDefined();
    }
  });
});

// =============================================================================
// SECTION 10: OPTIONAL FIELDS & DEFAULTS
// =============================================================================

describe("TransactionPayloadSchema - Optional Fields & Defaults", () => {
  const minimalPayload = {
    store_id: "550e8400-e29b-41d4-a716-446655440000",
    shift_id: "550e8400-e29b-41d4-a716-446655440001",
    subtotal: 100.0,
    line_items: [
      { sku: "SKU-001", name: "Test", quantity: 1, unit_price: 100.0 },
    ],
    payments: [{ method: "CASH" as const, amount: 100.0 }],
  };

  it("should apply default tax: 0", () => {
    const result = TransactionPayloadSchema.safeParse(minimalPayload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tax).toBe(0);
    }
  });

  it("should apply default discount: 0", () => {
    const result = TransactionPayloadSchema.safeParse(minimalPayload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.discount).toBe(0);
    }
  });

  it("should apply default line item discount: 0", () => {
    const result = TransactionPayloadSchema.safeParse(minimalPayload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.line_items[0].discount).toBe(0);
    }
  });

  it("should accept optional timestamp", () => {
    const payload = {
      ...minimalPayload,
      timestamp: "2025-11-27T12:00:00.000Z",
    };
    const result = TransactionPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it("should accept optional pos_terminal_id", () => {
    const payload = {
      ...minimalPayload,
      pos_terminal_id: "550e8400-e29b-41d4-a716-446655440099",
    };
    const result = TransactionPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });
});
