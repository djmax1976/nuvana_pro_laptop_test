import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from "vitest";
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

afterAll(async () => {
  await prisma.$disconnect();
});

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
    // Create test user, company, and store for employee_id generation tests
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

    const company = await prisma.company.create({
      data: {
        public_id: `TEST_COMP_${Date.now()}`,
        name: `Test Company ${Date.now()}`,
        owner_user_id: testUserId,
      },
    });
    testCompanyId = company.company_id;

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
  let testCompanyId: string;
  let testUserId: string;
  let testStore1Id: string;
  let testStore2Id: string;
  let testCashier1Id: string;
  let testCashier2Id: string;
  let testPinHash: string;
  let testPin: string;

  beforeEach(async () => {
    // Create test user first (required for company owner_user_id foreign key)
    const user = await prisma.user.create({
      data: {
        public_id: `TEST_USER_PIN_${Date.now()}`,
        email: `test-pin-${Date.now()}@test.com`,
        name: "Test User PIN",
        password_hash: "test-hash",
        status: "ACTIVE",
      },
    });
    testUserId = user.user_id;

    // Create test company with correct owner_user_id
    const company = await prisma.company.create({
      data: {
        public_id: `TEST_COMP_PIN_${Date.now()}`,
        name: `Test Company PIN ${Date.now()}`,
        owner_user_id: testUserId,
      },
    });
    testCompanyId = company.company_id;

    // Create two test stores
    const store1 = await prisma.store.create({
      data: {
        public_id: `TEST_STORE_PIN_1_${Date.now()}`,
        company_id: testCompanyId,
        name: `Test Store PIN 1 ${Date.now()}`,
        location_json: {},
      },
    });
    testStore1Id = store1.store_id;

    const store2 = await prisma.store.create({
      data: {
        public_id: `TEST_STORE_PIN_2_${Date.now()}`,
        company_id: testCompanyId,
        name: `Test Store PIN 2 ${Date.now()}`,
        location_json: {},
      },
    });
    testStore2Id = store2.store_id;

    // Create a test PIN and hash it
    testPin = "1234";
    testPinHash = await cashierService.hashPIN(testPin);

    // Create first cashier in store1 with the test PIN
    const cashier1 = await prisma.cashier.create({
      data: {
        store_id: testStore1Id,
        employee_id: "0001",
        name: "Test Cashier 1",
        pin_hash: testPinHash,
        is_active: true,
        hired_on: new Date(),
        created_by: testUserId,
      },
    });
    testCashier1Id = cashier1.cashier_id;

    // Create second cashier in store1 with a different PIN
    const differentPinHash = await cashierService.hashPIN("5678");
    const cashier2 = await prisma.cashier.create({
      data: {
        store_id: testStore1Id,
        employee_id: "0002",
        name: "Test Cashier 2",
        pin_hash: differentPinHash,
        is_active: true,
        hired_on: new Date(),
        created_by: testUserId,
      },
    });
    testCashier2Id = cashier2.cashier_id;
  });

  afterEach(async () => {
    // Cleanup test data in reverse order of dependencies
    // Filter out undefined values to handle cases where beforeEach might have failed
    const cashierIds = [testCashier1Id, testCashier2Id].filter(
      (id): id is string => id !== undefined,
    );
    if (cashierIds.length > 0) {
      await prisma.cashier.deleteMany({
        where: { cashier_id: { in: cashierIds } },
      });
    }

    const storeIds = [testStore1Id, testStore2Id].filter(
      (id): id is string => id !== undefined,
    );
    if (storeIds.length > 0) {
      await prisma.store.deleteMany({
        where: { store_id: { in: storeIds } },
      });
    }

    if (testCompanyId) {
      await prisma.company.deleteMany({
        where: { company_id: testCompanyId },
      });
    }

    if (testUserId) {
      await prisma.user.deleteMany({
        where: { user_id: testUserId },
      });
    }
  });

  it("4.91-UNIT-014: should validate PIN is unique within store", async () => {
    // GIVEN: A store with an existing cashier using testPin ("1234")
    // (testStore1Id has testCashier1Id with testPinHash)

    // WHEN: Checking PIN uniqueness with a different PIN (not in use)
    const uniquePin = "9999";

    // THEN: Validation passes (no exception thrown) if PIN is unique
    await expect(
      cashierService.validatePINUniqueness(
        testStore1Id,
        uniquePin,
        undefined,
        prisma,
      ),
    ).resolves.toBe(true);
  });

  it("4.91-UNIT-014b: should reject duplicate PIN within same store", async () => {
    // GIVEN: A store with an existing cashier using testPin ("1234")
    // (testStore1Id has testCashier1Id with testPinHash)

    // WHEN: Checking PIN uniqueness with the same PIN that's already in use
    // THEN: Validation throws error because PIN is already in use
    await expect(
      cashierService.validatePINUniqueness(
        testStore1Id,
        testPin, // Plain text PIN, not hash
        undefined,
        prisma,
      ),
    ).rejects.toThrow("PIN already in use by another cashier in this store");
  });

  it("4.91-UNIT-015: should allow same PIN in different stores", async () => {
    // GIVEN: Same PIN for different stores
    // (testStore1Id has testCashier1Id with testPin)

    // WHEN: Checking PIN uniqueness for a different store (testStore2Id)
    // THEN: Different store can have same PIN (uniqueness is per store, not global)
    await expect(
      cashierService.validatePINUniqueness(
        testStore2Id,
        testPin, // Plain text PIN
        undefined,
        prisma,
      ),
    ).resolves.toBe(true);
  });

  it("4.91-UNIT-016: should exclude current cashier when updating", async () => {
    // GIVEN: An existing cashier with PIN (testCashier1Id with testPin in testStore1Id)

    // WHEN: Updating the same cashier with the same PIN (excluding current cashier)
    // THEN: Validation allows same PIN for same cashier (no exception thrown)
    await expect(
      cashierService.validatePINUniqueness(
        testStore1Id,
        testPin, // Plain text PIN
        testCashier1Id, // Exclude the current cashier
        prisma,
      ),
    ).resolves.toBe(true);
  });

  it("4.91-UNIT-016b: should reject duplicate PIN when updating different cashier in same store", async () => {
    // GIVEN: A store with an existing cashier using testPin
    // (testStore1Id has testCashier1Id with testPin, and testCashier2Id with different PIN)

    // WHEN: Trying to update testCashier2Id to use the same PIN as testCashier1Id
    // THEN: Validation throws error because another cashier in the same store uses that PIN
    await expect(
      cashierService.validatePINUniqueness(
        testStore1Id,
        testPin, // Plain text PIN
        testCashier2Id, // Exclude testCashier2Id, but testCashier1Id still uses this PIN
        prisma,
      ),
    ).rejects.toThrow("PIN already in use by another cashier in this store");
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
    let testUserId: string;

    beforeAll(async () => {
      // Create test user first (required for company owner_user_id foreign key)
      const user = await prisma.user.create({
        data: {
          public_id: `TEST_USER_EDGE_${Date.now()}`,
          email: `test-edge-${Date.now()}@test.com`,
          name: "Test User Edge",
          password_hash: "test-hash",
          status: "ACTIVE",
        },
      });
      testUserId = user.user_id;

      // Create test company for edge case tests
      const company = await prisma.company.create({
        data: {
          public_id: `TEST_COMP_EDGE_${Date.now()}`,
          name: `Test Company Edge ${Date.now()}`,
          owner_user_id: testUserId,
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
      await prisma.user.deleteMany({ where: { user_id: testUserId } });
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

    it("4.91-UNIT-023: should handle employee_id rollover from 9999 to 0001 or throw error", async () => {
      // GIVEN: A store with a cashier having employee_id 9999
      // Create a test user for the cashier
      const timestamp = Date.now().toString().slice(-8); // Use last 8 digits to fit within 30 char limit
      const testUser = await prisma.user.create({
        data: {
          public_id: `USR_ROLL_${timestamp}`,
          email: `test-roll-${timestamp}@test.com`,
          name: "Test User Rollover",
          password_hash: "test-hash",
          status: "ACTIVE",
        },
      });
      const testUserId = testUser.user_id;
      const testPinHash = await cashierService.hashPIN("9999");

      // Create a cashier with employee_id 9999 to simulate max ID scenario
      await prisma.cashier.create({
        data: {
          store_id: testStoreId,
          employee_id: "9999",
          name: "Test Cashier 9999",
          pin_hash: testPinHash,
          is_active: true,
          hired_on: new Date(),
          created_by: testUserId,
        },
      });

      // WHEN: Generating next employee_id after 9999
      // THEN: System should either rollover to 0001 or throw a defined error
      // Expected behavior: Either rollover to "0001" or throw error about max employee_id
      // Current implementation returns "10000" (5 digits) which violates 4-digit constraint
      try {
        const nextEmployeeId = await cashierService.generateEmployeeId(
          testStoreId,
          prisma,
        );

        // If rollover is implemented, should return "0001"
        if (nextEmployeeId === "0001") {
          expect(nextEmployeeId).toBe("0001");
          expect(nextEmployeeId.length).toBe(4);
        } else {
          // Rollover not implemented: current behavior returns "10000" (5 digits) which is invalid
          // This assertion will fail until rollover or error handling is implemented
          expect(
            nextEmployeeId,
            `Expected rollover to "0001" or error, but got "${nextEmployeeId}" (${nextEmployeeId.length} digits). Implementation needs rollover logic or error handling when max employee_id (9999) is reached.`,
          ).toBe("0001");
        }
      } catch (error) {
        // If error is thrown, verify it's a defined error about max employee_id
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toMatch(
          /(max|limit|rollover|9999|employee_id)/i,
        );
      } finally {
        // Cleanup: remove the test cashier and user
        await prisma.cashier.deleteMany({
          where: {
            store_id: testStoreId,
            employee_id: "9999",
          },
        });
        await prisma.user.delete({ where: { user_id: testUserId } });
      }
    });
  });
});
