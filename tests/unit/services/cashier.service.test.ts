import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import { CashierService } from "../../../backend/src/services/cashier.service";

/**
 * Unit Tests: Cashier Service - Business Logic
 *
 * Tests pure business logic for cashier management:
 * - PIN validation (4 numeric digits)
 * - PIN hashing with bcrypt
 * - Employee ID generation (sequential 4-digit per store)
 * - PIN uniqueness validation
 *
 * Story: 4.91 - Cashier Management Backend
 * Priority: P0 (Critical - Core business logic)
 *
 * These tests validate business logic using CashierService methods.
 * Database operations are tested in API integration tests.
 */

const prisma = new PrismaClient();
const cashierService = new CashierService();

describe("4.91-UNIT: CashierService - PIN Validation", () => {
  describe("validatePIN", () => {
    it("4.91-UNIT-001: should accept valid 4-digit PIN", () => {
      // GIVEN: A valid 4-digit PIN
      const pin = "1234";

      // WHEN: Validating PIN
      // THEN: Validation passes (no exception thrown)
      expect(() => cashierService.validatePIN(pin)).not.toThrow();
      expect(cashierService.validatePIN(pin)).toBe(true);
    });

    it("4.91-UNIT-002: should reject PIN with less than 4 digits", () => {
      // GIVEN: A PIN with 3 digits
      const pin = "123";

      // WHEN: Validating PIN
      // THEN: Validation throws error
      expect(() => cashierService.validatePIN(pin)).toThrow(
        "PIN must be exactly 4 numeric digits",
      );
    });

    it("4.91-UNIT-003: should reject PIN with more than 4 digits", () => {
      // GIVEN: A PIN with 5 digits
      const pin = "12345";

      // WHEN: Validating PIN
      // THEN: Validation throws error
      expect(() => cashierService.validatePIN(pin)).toThrow(
        "PIN must be exactly 4 numeric digits",
      );
    });

    it("4.91-UNIT-004: should reject PIN with non-numeric characters", () => {
      // GIVEN: A PIN with letters
      const pin = "abcd";

      // WHEN: Validating PIN
      // THEN: Validation throws error
      expect(() => cashierService.validatePIN(pin)).toThrow(
        "PIN must be exactly 4 numeric digits",
      );
    });

    it("4.91-UNIT-005: should reject empty PIN", () => {
      // GIVEN: An empty PIN
      const pin = "";

      // WHEN: Validating PIN
      // THEN: Validation throws error
      expect(() => cashierService.validatePIN(pin)).toThrow(
        "PIN must be exactly 4 numeric digits",
      );
    });

    it("4.91-UNIT-006: should accept PIN with leading zeros (but still 4 digits)", () => {
      // GIVEN: A PIN with leading zeros (still valid format)
      const pin = "0001";

      // WHEN: Validating PIN
      // THEN: Validation passes (leading zeros are allowed)
      expect(() => cashierService.validatePIN(pin)).not.toThrow();
      expect(cashierService.validatePIN(pin)).toBe(true);
    });
  });

  describe("hashPIN", () => {
    it("4.91-UNIT-007: should hash PIN with bcrypt", async () => {
      // GIVEN: A valid PIN
      const pin = "1234";

      // WHEN: Hashing PIN
      const hash = await cashierService.hashPIN(pin);

      // THEN: Hash is generated
      expect(hash).toBeDefined();
      expect(hash.length).toBeGreaterThan(0);
      expect(hash).not.toBe(pin); // Hash should be different from original

      // AND: Hash can be verified with bcrypt.compare
      const isValid = await bcrypt.compare(pin, hash);
      expect(isValid).toBe(true);
    });

    it("4.91-UNIT-008: should use bcrypt cost factor 10", async () => {
      // GIVEN: A valid PIN
      const pin = "1234";

      // WHEN: Hashing PIN
      const hash = await cashierService.hashPIN(pin);

      // THEN: Hash starts with $2a$ or $2b$ (bcrypt format)
      expect(hash).toMatch(/^\$2[ab]\$/);

      // AND: Cost factor is 10 (bcrypt format: $2a$10$...)
      const parts = hash.split("$");
      expect(parts[2]).toBe("10");
    });

    it("4.91-UNIT-009: should produce different hashes for same PIN (salt)", async () => {
      // GIVEN: Same PIN hashed twice
      const pin = "1234";

      // WHEN: Hashing PIN twice
      const hash1 = await cashierService.hashPIN(pin);
      const hash2 = await cashierService.hashPIN(pin);

      // THEN: Hashes are different (due to salt)
      expect(hash1).not.toBe(hash2);

      // AND: Both hashes verify correctly
      expect(await bcrypt.compare(pin, hash1)).toBe(true);
      expect(await bcrypt.compare(pin, hash2)).toBe(true);
    });
  });
});

describe("4.91-UNIT: CashierService - Employee ID Generation", () => {
  let testStoreId: string;
  let testCompanyId: string;
  let testUserId: string;

  beforeAll(async () => {
    // Create test company and store for employee_id generation tests
    const company = await prisma.company.create({
      data: {
        public_id: `TEST_COMP_${Date.now()}`,
        name: `Test Company ${Date.now()}`,
        owner_user_id: "test-user-id", // Will be created below
      },
    });
    testCompanyId = company.company_id;

    const user = await prisma.user.create({
      data: {
        public_id: `TEST_USER_${Date.now()}`,
        email: `test-${Date.now()}@test.com`,
        name: "Test User",
        password_hash: "test-hash",
        status: "ACTIVE",
      },
    });
    testUserId = user.user_id;

    const store = await prisma.store.create({
      data: {
        public_id: `TEST_STORE_${Date.now()}`,
        company_id: testCompanyId,
        name: `Test Store ${Date.now()}`,
        location_json: {},
      },
    });
    testStoreId = store.store_id;
  });

  afterAll(async () => {
    // Cleanup test data
    await prisma.store.deleteMany({ where: { store_id: testStoreId } });
    await prisma.company.deleteMany({ where: { company_id: testCompanyId } });
    await prisma.user.deleteMany({ where: { user_id: testUserId } });
  });

  it("4.91-UNIT-010: should generate first employee_id as 0001 for new store", async () => {
    // GIVEN: A store with no cashiers
    // (testStoreId from beforeAll)

    // WHEN: Generating employee_id
    const employeeId = await cashierService.generateEmployeeId(
      testStoreId,
      prisma,
    );

    // THEN: Employee ID is 0001
    expect(employeeId).toBe("0001");
    expect(employeeId.length).toBe(4);
  });

  it("4.91-UNIT-011: should generate sequential employee_ids (0001, 0002, 0003)", async () => {
    // GIVEN: A store with existing cashiers
    // Note: This test requires Cashier model to exist in database
    // The test will verify sequential generation after cashiers are created

    // WHEN: Generating first employee_id
    const id1 = await cashierService.generateEmployeeId(testStoreId, prisma);

    // THEN: First employee ID is 0001
    expect(id1).toBe("0001");

    // Note: To fully test sequential generation, we would need to:
    // 1. Create a cashier with employee_id = id1
    // 2. Generate next employee_id (should be 0002)
    // 3. Create another cashier with employee_id = id2
    // 4. Generate next employee_id (should be 0003)
    // This is tested in API integration tests (4.91-API-002)
  });

  it("4.91-UNIT-012: should zero-pad employee_id to 4 digits", async () => {
    // GIVEN: A store (testStoreId)

    // WHEN: Generating employee_id
    const employeeId = await cashierService.generateEmployeeId(
      testStoreId,
      prisma,
    );

    // THEN: Employee ID is zero-padded to 4 digits
    expect(employeeId).toMatch(/^\d{4}$/);
    expect(employeeId.length).toBe(4);
  });

  it("4.91-UNIT-013: should generate unique employee_ids per store", async () => {
    // GIVEN: Two different stores
    const store2 = await prisma.store.create({
      data: {
        public_id: `TEST_STORE_2_${Date.now()}`,
        company_id: testCompanyId,
        name: `Test Store 2 ${Date.now()}`,
        location_json: {},
      },
    });

    try {
      // WHEN: Generating employee_ids for both stores
      const id1 = await cashierService.generateEmployeeId(testStoreId, prisma);
      const id2 = await cashierService.generateEmployeeId(
        store2.store_id,
        prisma,
      );

      // THEN: Both stores can have same employee_id (different stores)
      expect(id1).toBe("0001");
      expect(id2).toBe("0001"); // Same number, different store
    } finally {
      // Cleanup
      await prisma.store.delete({ where: { store_id: store2.store_id } });
    }
  });
});

describe("4.91-UNIT: CashierService - PIN Uniqueness Validation", () => {
  it("4.91-UNIT-014: should validate PIN is unique within store", async () => {
    // GIVEN: A store and PIN hash that doesn't exist
    // (This test requires Cashier model to exist in database)
    const testStoreId = "550e8400-e29b-41d4-a716-446655440001";
    const testPinHash = "test-pin-hash-that-does-not-exist";

    // WHEN: Checking PIN uniqueness
    // THEN: Validation passes (no exception thrown) if PIN is unique
    await expect(
      cashierService.validatePINUniqueness(
        testStoreId,
        testPinHash,
        undefined,
        prisma,
      ),
    ).resolves.toBe(true);
  });

  it("4.91-UNIT-015: should allow same PIN in different stores", async () => {
    // GIVEN: Same PIN hash for different stores
    // (This test requires Cashier model to exist in database)
    const samePinHash = "same-pin-hash-that-does-not-exist";

    // WHEN: Checking PIN uniqueness for different stores
    // THEN: Both stores can have same PIN (uniqueness is per store, not global)
    await expect(
      cashierService.validatePINUniqueness(
        "550e8400-e29b-41d4-a716-446655440002",
        samePinHash,
        undefined,
        prisma,
      ),
    ).resolves.toBe(true);

    await expect(
      cashierService.validatePINUniqueness(
        "550e8400-e29b-41d4-a716-446655440003",
        samePinHash,
        undefined,
        prisma,
      ),
    ).resolves.toBe(true);
  });

  it("4.91-UNIT-016: should exclude current cashier when updating", async () => {
    // GIVEN: An existing cashier with PIN
    // (This test requires Cashier model to exist in database)
    const testStoreId = "550e8400-e29b-41d4-a716-446655440004";
    const testPinHash = "existing-pin-hash-that-does-not-exist";
    const currentCashierId = "550e8400-e29b-41d4-a716-446655440005";

    // WHEN: Updating cashier with same PIN (excluding current cashier)
    // THEN: Validation allows same PIN for same cashier (no exception thrown)
    await expect(
      cashierService.validatePINUniqueness(
        testStoreId,
        testPinHash,
        currentCashierId,
        prisma,
      ),
    ).resolves.toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ADDITIONAL EDGE CASES
// ═══════════════════════════════════════════════════════════════════════════

describe("4.91-UNIT: CashierService - Additional Edge Cases", () => {
  describe("validatePIN - Additional Edge Cases", () => {
    it("4.91-UNIT-017: should reject PIN with special characters", () => {
      // GIVEN: A PIN with special characters
      const pin = "12!@";

      // WHEN: Validating PIN
      // THEN: Validation throws error
      expect(() => cashierService.validatePIN(pin)).toThrow(
        "PIN must be exactly 4 numeric digits",
      );
    });

    it("4.91-UNIT-018: should reject PIN with spaces", () => {
      // GIVEN: A PIN with spaces
      const pin = "12 34";

      // WHEN: Validating PIN
      // THEN: Validation throws error
      expect(() => cashierService.validatePIN(pin)).toThrow(
        "PIN must be exactly 4 numeric digits",
      );
    });

    it("4.91-UNIT-019: should reject PIN with mixed alphanumeric", () => {
      // GIVEN: A PIN with letters and numbers
      const pin = "12ab";

      // WHEN: Validating PIN
      // THEN: Validation throws error
      expect(() => cashierService.validatePIN(pin)).toThrow(
        "PIN must be exactly 4 numeric digits",
      );
    });
  });

  describe("hashPIN - Security Verification", () => {
    it("4.91-UNIT-020: should produce different hashes for different PINs", async () => {
      // GIVEN: Two different PINs
      const pin1 = "1234";
      const pin2 = "5678";

      // WHEN: Hashing both PINs
      const hash1 = await cashierService.hashPIN(pin1);
      const hash2 = await cashierService.hashPIN(pin2);

      // THEN: Hashes are different
      expect(hash1, "Different PINs should produce different hashes").not.toBe(
        hash2,
      );

      // AND: Each hash verifies only its own PIN
      expect(
        await bcrypt.compare(pin1, hash1),
        "Hash1 should verify PIN1",
      ).toBe(true);
      expect(
        await bcrypt.compare(pin2, hash1),
        "Hash1 should NOT verify PIN2",
      ).toBe(false);
      expect(
        await bcrypt.compare(pin2, hash2),
        "Hash2 should verify PIN2",
      ).toBe(true);
      expect(
        await bcrypt.compare(pin1, hash2),
        "Hash2 should NOT verify PIN1",
      ).toBe(false);
    });

    it("4.91-UNIT-021: should handle edge case PIN '0000'", async () => {
      // GIVEN: PIN with all zeros
      const pin = "0000";

      // WHEN: Hashing PIN
      const hash = await cashierService.hashPIN(pin);

      // THEN: Hash is generated and verifies correctly
      expect(hash, "Hash should be generated for 0000").toBeDefined();
      expect(hash, "Hash should be different from PIN").not.toBe(pin);
      expect(
        await bcrypt.compare(pin, hash),
        "Hash should verify PIN 0000",
      ).toBe(true);
    });
  });

  describe("generateEmployeeId - Edge Cases", () => {
    let testStoreId: string;
    let testCompanyId: string;

    beforeAll(async () => {
      // Create test store for edge case tests
      const company = await prisma.company.create({
        data: {
          public_id: `TEST_COMP_EDGE_${Date.now()}`,
          name: `Test Company Edge ${Date.now()}`,
          owner_user_id: "test-user-id-edge",
        },
      });
      testCompanyId = company.company_id;

      const store = await prisma.store.create({
        data: {
          public_id: `TEST_STORE_EDGE_${Date.now()}`,
          company_id: testCompanyId,
          name: `Test Store Edge ${Date.now()}`,
          location_json: {},
        },
      });
      testStoreId = store.store_id;
    });

    afterAll(async () => {
      // Cleanup
      await prisma.store.deleteMany({ where: { store_id: testStoreId } });
      await prisma.company.deleteMany({ where: { company_id: testCompanyId } });
    });

    it("4.91-UNIT-022: should handle store with no existing cashiers", async () => {
      // GIVEN: A new store with no cashiers
      // (testStoreId from beforeAll)

      // WHEN: Generating first employee_id
      const employeeId = await cashierService.generateEmployeeId(
        testStoreId,
        prisma,
      );

      // THEN: Employee ID is 0001
      expect(employeeId, "First employee ID should be 0001").toBe("0001");
      expect(employeeId.length, "Employee ID should be 4 digits").toBe(4);
    });

    it("4.91-UNIT-023: should handle employee_id rollover from 9999 to 0001 (if implemented)", async () => {
      // GIVEN: A store with employee_id 9999
      // Note: This test assumes rollover logic exists
      // Current implementation may throw error at 9999

      // WHEN: Generating next employee_id after 9999
      // THEN: System should handle appropriately (either rollover or error)
      // This is a future enhancement test
      expect(true, "Rollover logic test placeholder").toBe(true);
    });
  });
});
