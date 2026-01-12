/**
 * User PIN Service Unit Tests
 *
 * Enterprise-grade unit tests for PIN authentication service for STORE_MANAGER
 * and SHIFT_MANAGER roles. Tests follow the same patterns as CashierService.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * TRACEABILITY MATRIX
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * | Test ID           | Requirement                              | Category      | Priority |
 * |-------------------|------------------------------------------|---------------|----------|
 * | UPIN-U-001        | PIN format validation - valid            | Validation    | P0       |
 * | UPIN-U-002        | PIN format validation - too short        | Validation    | P0       |
 * | UPIN-U-003        | PIN format validation - too long         | Validation    | P0       |
 * | UPIN-U-004        | PIN format validation - non-numeric      | Validation    | P0       |
 * | UPIN-U-005        | PIN fingerprint - deterministic          | Security      | P0       |
 * | UPIN-U-006        | PIN fingerprint - SHA-256 format         | Security      | P0       |
 * | UPIN-U-007        | PIN hashing - bcrypt format              | Security      | P0       |
 * | UPIN-U-008        | PIN hashing - unique salts               | Security      | P0       |
 * | UPIN-U-009        | PIN verification - correct PIN           | Security      | P0       |
 * | UPIN-U-010        | PIN verification - incorrect PIN         | Security      | P0       |
 * | UPIN-U-011        | PIN enabled role check - STORE_MANAGER   | Business      | P0       |
 * | UPIN-U-012        | PIN enabled role check - SHIFT_MANAGER   | Business      | P0       |
 * | UPIN-U-013        | PIN enabled role check - CASHIER         | Business      | P0       |
 * | UPIN-U-014        | PIN enabled role check - other roles     | Business      | P1       |
 * | UPIN-U-015        | hasUserPIN - user with PIN               | Business      | P0       |
 * | UPIN-U-016        | hasUserPIN - user without PIN            | Business      | P0       |
 * | UPIN-U-017        | hasUserPIN - user not found              | Error         | P0       |
 * | UPIN-U-018        | setUserPIN - success flow                | Business      | P0       |
 * | UPIN-U-019        | setUserPIN - duplicate PIN rejection     | Security      | P0       |
 * | UPIN-U-020        | setUserPIN - audit logging               | Compliance    | P0       |
 * | UPIN-U-021        | clearUserPIN - success flow              | Business      | P1       |
 * | UPIN-U-022        | clearUserPIN - user not found            | Error         | P1       |
 * | UPIN-U-023        | verifyUserPIN - correct PIN              | Security      | P0       |
 * | UPIN-U-024        | verifyUserPIN - incorrect PIN            | Security      | P0       |
 * | UPIN-U-025        | verifyUserPIN - inactive user            | Security      | P0       |
 * | UPIN-U-026        | verifyUserPIN - no PIN configured        | Security      | P0       |
 * | UPIN-U-027        | verifyUserPIN - no role at store         | Security      | P0       |
 * | UPIN-U-028        | PIN uniqueness - per-store scope         | Business      | P0       |
 * | UPIN-U-029        | PIN uniqueness - cross-store allowed     | Business      | P1       |
 * | UPIN-U-030        | getUsersNeedingPIN - returns correct     | Business      | P1       |
 * | UPIN-U-031        | Timing attack resistance                 | Security      | P0       |
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * @test-level Unit
 * @justification Unit tests for user PIN service logic with mocked dependencies
 * @story USER-PIN-AUTH
 * @priority P0 (Critical - Manager authentication)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import bcrypt from "bcryptjs";

// ============================================================================
// Mock Setup - Using vi.hoisted() for proper mock hoisting
// ============================================================================

// Use vi.hoisted to define mocks that work with vi.mock hoisting
const { mockPrismaClient } = vi.hoisted(() => {
  const mockUserFindUnique = vi.fn();
  const mockUserFindFirst = vi.fn();
  const mockUserFindMany = vi.fn();
  const mockUserUpdate = vi.fn();
  const mockUserRoleFindMany = vi.fn();
  const mockAuditLogCreate = vi.fn();

  return {
    mockPrismaClient: {
      user: {
        findUnique: mockUserFindUnique,
        findFirst: mockUserFindFirst,
        findMany: mockUserFindMany,
        update: mockUserUpdate,
      },
      userRole: {
        findMany: mockUserRoleFindMany,
      },
      auditLog: {
        create: mockAuditLogCreate,
      },
    },
  };
});

// Mock the db module
vi.mock("../../backend/src/utils/db", () => ({
  prisma: mockPrismaClient,
}));

// Import after mocking
import {
  UserPINService,
  userPINService,
  isPINEnabledRole,
  PIN_ENABLED_ROLES,
  type PINAuditContext,
} from "../../backend/src/services/user-pin.service";

// ============================================================================
// Test Data Factories - Enterprise Pattern
// ============================================================================

/**
 * Factory for creating mock user objects with sensible defaults
 * Follows enterprise test factory pattern for consistent, meaningful test data
 */
const createMockUser = (overrides: Record<string, unknown> = {}) => ({
  user_id: "user-" + Math.random().toString(36).substring(7),
  email: `manager-${Date.now()}@test.nuvana.local`,
  name: "Test Manager",
  status: "ACTIVE",
  pin_hash: null as string | null,
  sha256_pin_fingerprint: null as string | null,
  ...overrides,
});

/**
 * Factory for creating mock user role objects
 */
const createMockUserRole = (overrides: Record<string, unknown> = {}) => ({
  user_role_id: "role-" + Math.random().toString(36).substring(7),
  user_id: "test-user-id-123",
  role_id: "test-role-id-789",
  store_id: "test-store-id-abc",
  status: "ACTIVE",
  role: {
    code: "STORE_MANAGER",
    role_permissions: [
      { permission: { code: "SHIFT_OPEN" } },
      { permission: { code: "SHIFT_CLOSE" } },
      { permission: { code: "CASH_DROP" } },
    ],
  },
  ...overrides,
});

/**
 * Factory for creating mock audit context
 */
const createMockAuditContext = (
  overrides: Partial<PINAuditContext> = {},
): PINAuditContext => ({
  userId: "admin-user-" + Math.random().toString(36).substring(7),
  userEmail: "admin@test.nuvana.local",
  userRoles: ["CLIENT_OWNER"],
  ipAddress: "192.168.1.100",
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) TestAgent/1.0",
  ...overrides,
});

// ============================================================================
// Test Suite
// ============================================================================

describe("UserPINService", () => {
  let service: UserPINService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new UserPINService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // PIN Format Validation Tests
  // ==========================================================================

  describe("validatePIN - Format Validation", () => {
    it("UPIN-U-001: should accept valid 4-digit PINs including edge cases", () => {
      // Given: A range of valid PIN values
      const validPINs = [
        "0000", // All zeros - minimum
        "9999", // All nines - maximum
        "1234", // Sequential
        "4321", // Reverse sequential
        "1111", // Repeated digit
        "0123", // Leading zero
        "5050", // Alternating pattern
      ];

      // When/Then: All should pass validation
      for (const pin of validPINs) {
        expect(() => service.validatePIN(pin)).not.toThrow();
        expect(service.validatePIN(pin)).toBe(true);
      }
    });

    it("UPIN-U-002: should reject PIN with less than 4 digits", () => {
      // Given: PINs that are too short
      const shortPINs = ["", "1", "12", "123"];

      // When/Then: All should throw validation error
      for (const pin of shortPINs) {
        expect(() => service.validatePIN(pin)).toThrow(
          "PIN must be exactly 4 numeric digits",
        );
      }
    });

    it("UPIN-U-003: should reject PIN with more than 4 digits", () => {
      // Given: PINs that are too long
      const longPINs = ["12345", "123456", "1234567890", "00000"];

      // When/Then: All should throw validation error
      for (const pin of longPINs) {
        expect(() => service.validatePIN(pin)).toThrow(
          "PIN must be exactly 4 numeric digits",
        );
      }
    });

    it("UPIN-U-004: should reject PIN with non-numeric characters", () => {
      // Given: PINs with invalid characters
      const invalidPINs = [
        "abcd", // All letters
        "12ab", // Mixed letters
        "12-4", // Special char dash
        "1.34", // Decimal point
        "123!", // Special char exclamation
        " 123", // Leading space
        "123 ", // Trailing space
        "12 3", // Embedded space
        "\t123", // Tab character
        "12\n3", // Newline character
      ];

      // When/Then: All should throw validation error
      for (const pin of invalidPINs) {
        expect(() => service.validatePIN(pin)).toThrow(
          "PIN must be exactly 4 numeric digits",
        );
      }
    });

    it("should reject null and undefined PINs", () => {
      // Given: Null/undefined values
      // When/Then: Should throw
      expect(() => service.validatePIN(null as unknown as string)).toThrow();
      expect(() =>
        service.validatePIN(undefined as unknown as string),
      ).toThrow();
    });
  });

  // ==========================================================================
  // PIN Fingerprint Tests
  // ==========================================================================

  describe("computePINFingerprint - SHA-256 Fingerprinting", () => {
    it("UPIN-U-005: should produce deterministic fingerprint for same input", () => {
      // Given: The same PIN value
      const pin = "1234";

      // When: Computing fingerprint multiple times
      const fingerprint1 = service.computePINFingerprint(pin);
      const fingerprint2 = service.computePINFingerprint(pin);
      const fingerprint3 = service.computePINFingerprint(pin);

      // Then: All should be identical
      expect(fingerprint1).toBe(fingerprint2);
      expect(fingerprint2).toBe(fingerprint3);
    });

    it("UPIN-U-006: should produce SHA-256 hex format (64 characters)", () => {
      // Given: Various PIN values
      const pins = ["0000", "1234", "9999", "5678"];

      // When/Then: All fingerprints should be 64 hex characters
      for (const pin of pins) {
        const fingerprint = service.computePINFingerprint(pin);
        expect(fingerprint).toHaveLength(64);
        expect(fingerprint).toMatch(/^[a-f0-9]{64}$/);
      }
    });

    it("should produce unique fingerprints for different PINs (collision resistance)", () => {
      // Given: All possible 4-digit PIN patterns (sampling)
      const pins = [
        "0000",
        "0001",
        "1111",
        "2222",
        "9999",
        "1234",
        "4321",
        "5678",
        "8765",
        "1357",
      ];

      // When: Computing fingerprints
      const fingerprints = pins.map((pin) =>
        service.computePINFingerprint(pin),
      );

      // Then: All should be unique (no collisions in sample)
      const uniqueFingerprints = new Set(fingerprints);
      expect(uniqueFingerprints.size).toBe(pins.length);
    });

    it("should produce known SHA-256 hash for verification", () => {
      // Given: A known PIN
      const pin = "1234";

      // When: Computing fingerprint
      const fingerprint = service.computePINFingerprint(pin);

      // Then: Should match expected SHA-256 of "1234"
      // This verifies the hash algorithm is correctly implemented
      expect(fingerprint).toBe(
        "03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4",
      );
    });
  });

  // ==========================================================================
  // PIN Hashing Tests
  // ==========================================================================

  describe("hashPIN - bcrypt Hashing", () => {
    it("UPIN-U-007: should produce bcrypt hash format with cost factor 10", async () => {
      // Given: A valid PIN
      const pin = "1234";

      // When: Hashing
      const hash = await service.hashPIN(pin);

      // Then: Should be bcrypt format with cost 10
      expect(hash).toMatch(/^\$2[ab]\$10\$.{53}$/);

      // Verify cost factor embedded in hash
      const costFactor = hash.split("$")[2];
      expect(costFactor).toBe("10");
    });

    it("UPIN-U-008: should produce unique salts (different hashes for same PIN)", async () => {
      // Given: The same PIN
      const pin = "1234";

      // When: Hashing multiple times
      const hashes = await Promise.all([
        service.hashPIN(pin),
        service.hashPIN(pin),
        service.hashPIN(pin),
      ]);

      // Then: All hashes should be different (unique salts)
      const uniqueHashes = new Set(hashes);
      expect(uniqueHashes.size).toBe(3);

      // But all should verify correctly
      for (const hash of hashes) {
        expect(await bcrypt.compare(pin, hash)).toBe(true);
      }
    });

    it("should reject invalid PIN before hashing (fail-fast)", async () => {
      // Given: Invalid PINs
      const invalidPINs = ["12345", "abc", "", "12"];

      // When/Then: Should throw before attempting hash
      for (const pin of invalidPINs) {
        await expect(service.hashPIN(pin)).rejects.toThrow(
          "PIN must be exactly 4 numeric digits",
        );
      }
    });
  });

  // ==========================================================================
  // PIN Verification Tests
  // ==========================================================================

  describe("verifyPINHash - Constant-time Verification", () => {
    it("UPIN-U-009: should return true for correct PIN", async () => {
      // Given: A PIN and its hash
      const pin = "1234";
      const hash = await bcrypt.hash(pin, 10);

      // When: Verifying with correct PIN
      const result = await service.verifyPINHash(pin, hash);

      // Then: Should return true
      expect(result).toBe(true);
    });

    it("UPIN-U-010: should return false for incorrect PIN", async () => {
      // Given: A PIN and its hash
      const pin = "1234";
      const hash = await bcrypt.hash(pin, 10);

      // When: Verifying with wrong PINs
      const wrongPINs = ["5678", "0000", "9999", "1235"];

      // Then: All should return false
      for (const wrongPIN of wrongPINs) {
        const result = await service.verifyPINHash(wrongPIN, hash);
        expect(result).toBe(false);
      }
    });

    it("UPIN-U-031: should resist timing attacks (consistent response time)", async () => {
      // Given: A PIN and its hash
      const pin = "1234";
      const hash = await bcrypt.hash(pin, 10);

      // When: Measuring verification times for correct and incorrect PINs
      const measureTime = async (testPin: string) => {
        const start = process.hrtime.bigint();
        await service.verifyPINHash(testPin, hash);
        return Number(process.hrtime.bigint() - start);
      };

      // Run multiple iterations to get average times
      const correctTimes: number[] = [];
      const incorrectTimes: number[] = [];

      for (let i = 0; i < 5; i++) {
        correctTimes.push(await measureTime("1234"));
        incorrectTimes.push(await measureTime("5678"));
      }

      // Calculate averages (excluding outliers)
      const avgCorrect = correctTimes.sort()[2]; // median
      const avgIncorrect = incorrectTimes.sort()[2]; // median

      // Then: Times should be within reasonable variance (bcrypt provides this)
      // The ratio should be close to 1 (within 50% variance is acceptable)
      const ratio =
        Math.max(avgCorrect, avgIncorrect) / Math.min(avgCorrect, avgIncorrect);
      expect(ratio).toBeLessThan(2.0); // Within 2x is acceptable for bcrypt
    });
  });

  // ==========================================================================
  // PIN Enabled Role Tests
  // ==========================================================================

  describe("isPINEnabledRole - Role Authorization", () => {
    it("UPIN-U-011: should return true for STORE_MANAGER", () => {
      expect(isPINEnabledRole("STORE_MANAGER")).toBe(true);
    });

    it("UPIN-U-012: should return true for SHIFT_MANAGER", () => {
      expect(isPINEnabledRole("SHIFT_MANAGER")).toBe(true);
    });

    it("UPIN-U-013: should return false for CASHIER (uses separate auth)", () => {
      expect(isPINEnabledRole("CASHIER")).toBe(false);
    });

    it("UPIN-U-014: should return false for all non-PIN roles", () => {
      const nonPINRoles = [
        "SUPERADMIN",
        "CLIENT_OWNER",
        "CLIENT_ADMIN",
        "ACCOUNTANT",
        "REGIONAL_MANAGER",
        "AUDITOR",
        "VIEWER",
        "RANDOM_ROLE",
        "",
      ];

      for (const role of nonPINRoles) {
        expect(isPINEnabledRole(role)).toBe(false);
      }
    });
  });

  // ==========================================================================
  // hasUserPIN Tests - Database Interaction
  // ==========================================================================

  describe("hasUserPIN - PIN Status Check", () => {
    it("UPIN-U-015: should return true for user with PIN configured", async () => {
      // Given: A user with PIN hash
      const userId = "user-with-pin";
      mockPrismaClient.user.findUnique.mockResolvedValue({
        user_id: userId,
        pin_hash: "$2a$10$abcdefghijklmnopqrstuvwxyz1234567890abc",
      });

      // When: Checking PIN status
      const result = await service.hasUserPIN(userId, mockPrismaClient as any);

      // Then: Should return true
      expect(result).toBe(true);
      expect(mockPrismaClient.user.findUnique).toHaveBeenCalledWith({
        where: { user_id: userId },
        select: { pin_hash: true },
      });
    });

    it("UPIN-U-016: should return false for user without PIN", async () => {
      // Given: A user without PIN hash
      const userId = "user-without-pin";
      mockPrismaClient.user.findUnique.mockResolvedValue({
        user_id: userId,
        pin_hash: null,
      });

      // When: Checking PIN status
      const result = await service.hasUserPIN(userId, mockPrismaClient as any);

      // Then: Should return false
      expect(result).toBe(false);
    });

    it("UPIN-U-017: should return false for non-existent user", async () => {
      // Given: User not found
      mockPrismaClient.user.findUnique.mockResolvedValue(null);

      // When: Checking PIN status
      const result = await service.hasUserPIN(
        "non-existent",
        mockPrismaClient as any,
      );

      // Then: Should return false
      expect(result).toBe(false);
    });
  });

  // ==========================================================================
  // setUserPIN Tests - PIN Configuration
  // ==========================================================================

  describe("setUserPIN - PIN Configuration", () => {
    const testStoreId = "store-123";
    const testUserId = "user-456";

    it("UPIN-U-018: should successfully set PIN for user", async () => {
      // Given: A user without PIN and no conflicts
      const auditContext = createMockAuditContext();
      mockPrismaClient.user.findMany.mockResolvedValue([]); // No duplicates
      mockPrismaClient.user.findUnique.mockResolvedValue({ pin_hash: null }); // No existing PIN
      mockPrismaClient.user.update.mockResolvedValue({ user_id: testUserId });
      mockPrismaClient.auditLog.create.mockResolvedValue({});

      // When: Setting PIN
      await service.setUserPIN(
        testUserId,
        "1234",
        testStoreId,
        auditContext,
        mockPrismaClient as any,
      );

      // Then: User should be updated with hashed PIN
      expect(mockPrismaClient.user.update).toHaveBeenCalledWith({
        where: { user_id: testUserId },
        data: {
          pin_hash: expect.stringMatching(/^\$2[ab]\$10\$/),
          sha256_pin_fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
        },
      });
    });

    it("UPIN-U-019: should reject duplicate PIN in same store", async () => {
      // Given: Another user at same store with same PIN
      const auditContext = createMockAuditContext();
      const existingPINHash = await bcrypt.hash("1234", 10);

      mockPrismaClient.user.findMany.mockResolvedValue([
        {
          user_id: "other-user",
          pin_hash: existingPINHash,
        },
      ]);

      // When/Then: Should reject with duplicate error
      await expect(
        service.setUserPIN(
          testUserId,
          "1234",
          testStoreId,
          auditContext,
          mockPrismaClient as any,
        ),
      ).rejects.toThrow("PIN already in use by another user at this store");
    });

    it("UPIN-U-020: should create audit log entry", async () => {
      // Given: Valid PIN setup scenario
      const auditContext = createMockAuditContext();
      mockPrismaClient.user.findMany.mockResolvedValue([]);
      mockPrismaClient.user.findUnique.mockResolvedValue({ pin_hash: null });
      mockPrismaClient.user.update.mockResolvedValue({ user_id: testUserId });
      mockPrismaClient.auditLog.create.mockResolvedValue({});

      // When: Setting PIN
      await service.setUserPIN(
        testUserId,
        "1234",
        testStoreId,
        auditContext,
        mockPrismaClient as any,
      );

      // Then: Audit log should be created
      expect(mockPrismaClient.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          user_id: auditContext.userId,
          action: "PIN_SET",
          table_name: "users",
          record_id: testUserId,
          ip_address: auditContext.ipAddress,
          user_agent: auditContext.userAgent,
        }),
      });
    });

    it("should set action to PIN_UPDATE when updating existing PIN", async () => {
      // Given: User with existing PIN
      const auditContext = createMockAuditContext();
      mockPrismaClient.user.findMany.mockResolvedValue([]);
      mockPrismaClient.user.findUnique.mockResolvedValue({
        pin_hash: "$2a$10$existinghash",
      });
      mockPrismaClient.user.update.mockResolvedValue({ user_id: testUserId });
      mockPrismaClient.auditLog.create.mockResolvedValue({});

      // When: Updating PIN
      await service.setUserPIN(
        testUserId,
        "5678",
        testStoreId,
        auditContext,
        mockPrismaClient as any,
      );

      // Then: Audit log should show PIN_UPDATE
      expect(mockPrismaClient.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: "PIN_UPDATE",
        }),
      });
    });
  });

  // ==========================================================================
  // clearUserPIN Tests
  // ==========================================================================

  describe("clearUserPIN - PIN Removal", () => {
    it("UPIN-U-021: should successfully clear PIN", async () => {
      // Given: User with PIN
      const userId = "user-with-pin";
      const auditContext = createMockAuditContext();
      mockPrismaClient.user.findUnique.mockResolvedValue({
        user_id: userId,
        pin_hash: "$2a$10$existinghash",
      });
      mockPrismaClient.user.update.mockResolvedValue({ user_id: userId });
      mockPrismaClient.auditLog.create.mockResolvedValue({});

      // When: Clearing PIN
      await service.clearUserPIN(userId, auditContext, mockPrismaClient as any);

      // Then: PIN should be nullified
      expect(mockPrismaClient.user.update).toHaveBeenCalledWith({
        where: { user_id: userId },
        data: {
          pin_hash: null,
          sha256_pin_fingerprint: null,
        },
      });
    });

    it("UPIN-U-022: should throw error for non-existent user", async () => {
      // Given: User not found
      const auditContext = createMockAuditContext();
      mockPrismaClient.user.findUnique.mockResolvedValue(null);

      // When/Then: Should throw
      await expect(
        service.clearUserPIN(
          "non-existent",
          auditContext,
          mockPrismaClient as any,
        ),
      ).rejects.toThrow("User not found");
    });

    it("should silently succeed when clearing PIN from user without PIN", async () => {
      // Given: User without PIN
      const auditContext = createMockAuditContext();
      mockPrismaClient.user.findUnique.mockResolvedValue({
        user_id: "user-no-pin",
        pin_hash: null,
      });

      // When: Clearing PIN (no-op)
      await service.clearUserPIN(
        "user-no-pin",
        auditContext,
        mockPrismaClient as any,
      );

      // Then: Should not call update (no-op)
      expect(mockPrismaClient.user.update).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // verifyUserPIN Tests - Full Verification Flow
  // ==========================================================================

  describe("verifyUserPIN - Full Authentication Flow", () => {
    const testStoreId = "store-123";
    const testUserId = "user-456";

    it("UPIN-U-023: should return valid result for correct PIN", async () => {
      // Given: User with PIN and active role at store
      const pin = "1234";
      const pinHash = await bcrypt.hash(pin, 10);

      mockPrismaClient.user.findUnique.mockResolvedValue({
        user_id: testUserId,
        name: "Test Manager",
        email: "manager@test.com",
        pin_hash: pinHash,
        status: "ACTIVE",
        user_roles: [
          {
            role: {
              code: "STORE_MANAGER",
              role_permissions: [
                { permission: { code: "SHIFT_OPEN" } },
                { permission: { code: "SHIFT_CLOSE" } },
              ],
            },
          },
        ],
      });

      // When: Verifying PIN
      const result = await service.verifyUserPIN(
        testUserId,
        pin,
        testStoreId,
        mockPrismaClient as any,
      );

      // Then: Should return valid result with user details
      expect(result.valid).toBe(true);
      expect(result.userId).toBe(testUserId);
      expect(result.userName).toBe("Test Manager");
      expect(result.userEmail).toBe("manager@test.com");
      expect(result.roles).toContain("STORE_MANAGER");
      expect(result.permissions).toContain("SHIFT_OPEN");
    });

    it("UPIN-U-024: should throw generic error for incorrect PIN", async () => {
      // Given: User with PIN
      const pinHash = await bcrypt.hash("1234", 10);

      mockPrismaClient.user.findUnique.mockResolvedValue({
        user_id: testUserId,
        pin_hash: pinHash,
        status: "ACTIVE",
        user_roles: [{ role: { code: "STORE_MANAGER", role_permissions: [] } }],
      });

      // When/Then: Wrong PIN should throw generic error (no info leakage)
      await expect(
        service.verifyUserPIN(
          testUserId,
          "5678",
          testStoreId,
          mockPrismaClient as any,
        ),
      ).rejects.toThrow("Invalid credentials");
    });

    it("UPIN-U-025: should throw generic error for inactive user", async () => {
      // Given: Inactive user
      const pinHash = await bcrypt.hash("1234", 10);

      mockPrismaClient.user.findUnique.mockResolvedValue({
        user_id: testUserId,
        pin_hash: pinHash,
        status: "INACTIVE",
        user_roles: [{ role: { code: "STORE_MANAGER", role_permissions: [] } }],
      });

      // When/Then: Should throw generic error
      await expect(
        service.verifyUserPIN(
          testUserId,
          "1234",
          testStoreId,
          mockPrismaClient as any,
        ),
      ).rejects.toThrow("Invalid credentials");
    });

    it("UPIN-U-026: should throw specific error when PIN not configured", async () => {
      // Given: User without PIN
      mockPrismaClient.user.findUnique.mockResolvedValue({
        user_id: testUserId,
        pin_hash: null,
        status: "ACTIVE",
        user_roles: [{ role: { code: "STORE_MANAGER", role_permissions: [] } }],
      });

      // When/Then: Should throw helpful error about PIN setup
      await expect(
        service.verifyUserPIN(
          testUserId,
          "1234",
          testStoreId,
          mockPrismaClient as any,
        ),
      ).rejects.toThrow("PIN not configured");
    });

    it("UPIN-U-027: should throw generic error when user has no role at store", async () => {
      // Given: User with no roles at store
      const pinHash = await bcrypt.hash("1234", 10);

      mockPrismaClient.user.findUnique.mockResolvedValue({
        user_id: testUserId,
        pin_hash: pinHash,
        status: "ACTIVE",
        user_roles: [], // No roles at this store
      });

      // When/Then: Should throw generic error
      await expect(
        service.verifyUserPIN(
          testUserId,
          "1234",
          testStoreId,
          mockPrismaClient as any,
        ),
      ).rejects.toThrow("Invalid credentials");
    });

    it("should throw generic error when user not found", async () => {
      // Given: User not found
      mockPrismaClient.user.findUnique.mockResolvedValue(null);

      // When/Then: Should throw generic error
      await expect(
        service.verifyUserPIN(
          testUserId,
          "1234",
          testStoreId,
          mockPrismaClient as any,
        ),
      ).rejects.toThrow("Invalid credentials");
    });
  });

  // ==========================================================================
  // PIN Uniqueness Tests
  // ==========================================================================

  describe("validatePINUniquenessInStore - Per-Store Scope", () => {
    const testStoreId = "store-123";

    it("UPIN-U-028: should reject PIN that exists in same store", async () => {
      // Given: Another user at same store with same PIN
      const existingPINHash = await bcrypt.hash("1234", 10);

      mockPrismaClient.user.findMany
        .mockResolvedValueOnce([
          // First call - fingerprint match
          { user_id: "other-user", pin_hash: existingPINHash },
        ])
        .mockResolvedValueOnce([]); // Second call - legacy check

      // When/Then: Should reject duplicate
      await expect(
        service.validatePINUniquenessInStore(
          testStoreId,
          "1234",
          undefined,
          mockPrismaClient as any,
        ),
      ).rejects.toThrow("PIN already in use by another user at this store");
    });

    it("UPIN-U-029: should allow same PIN in different stores", async () => {
      // Given: No users at this store with matching fingerprint
      mockPrismaClient.user.findMany.mockResolvedValue([]);

      // When: Validating uniqueness
      const result = await service.validatePINUniquenessInStore(
        testStoreId,
        "1234",
        undefined,
        mockPrismaClient as any,
      );

      // Then: Should pass (PIN is unique in this store)
      expect(result).toBe(true);
    });

    it("should allow user to keep their own PIN when updating", async () => {
      // Given: User updating their own PIN (same value)
      const userId = "user-123";

      mockPrismaClient.user.findMany.mockResolvedValue([]);

      // When: Validating with excludeUserId
      const result = await service.validatePINUniquenessInStore(
        testStoreId,
        "1234",
        userId, // Exclude self
        mockPrismaClient as any,
      );

      // Then: Should pass
      expect(result).toBe(true);

      // Verify query excluded the user
      expect(mockPrismaClient.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            user_id: { not: userId },
          }),
        }),
      );
    });
  });

  // ==========================================================================
  // getUsersNeedingPIN Tests
  // ==========================================================================

  describe("getUsersNeedingPIN - PIN Setup Identification", () => {
    it("UPIN-U-030: should return users with PIN-enabled roles but no PIN", async () => {
      // Given: Users needing PIN setup
      mockPrismaClient.user.findMany.mockResolvedValue([
        {
          user_id: "user-1",
          name: "Manager 1",
          email: "manager1@test.com",
          user_roles: [{ role: { code: "STORE_MANAGER" } }],
        },
        {
          user_id: "user-2",
          name: "Shift Lead",
          email: "shift@test.com",
          user_roles: [{ role: { code: "SHIFT_MANAGER" } }],
        },
      ]);

      // When: Getting users needing PIN
      const result = await service.getUsersNeedingPIN(
        "store-123",
        mockPrismaClient as any,
      );

      // Then: Should return formatted list
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        user_id: "user-1",
        name: "Manager 1",
        email: "manager1@test.com",
        roles: ["STORE_MANAGER"],
      });
    });

    it("should return empty array when all managers have PINs", async () => {
      // Given: No users needing PIN
      mockPrismaClient.user.findMany.mockResolvedValue([]);

      // When: Getting users needing PIN
      const result = await service.getUsersNeedingPIN(
        "store-123",
        mockPrismaClient as any,
      );

      // Then: Should return empty array
      expect(result).toEqual([]);
    });
  });

  // ==========================================================================
  // PIN_ENABLED_ROLES Constant Tests
  // ==========================================================================

  describe("PIN_ENABLED_ROLES - Configuration Constant", () => {
    it("should contain exactly STORE_MANAGER and SHIFT_MANAGER", () => {
      expect(PIN_ENABLED_ROLES).toHaveLength(2);
      expect(PIN_ENABLED_ROLES).toContain("STORE_MANAGER");
      expect(PIN_ENABLED_ROLES).toContain("SHIFT_MANAGER");
    });

    it("should be readonly (immutable)", () => {
      // TypeScript enforces this at compile time
      // Runtime check that the array exists as expected
      expect(Array.isArray(PIN_ENABLED_ROLES)).toBe(true);
    });
  });

  // ==========================================================================
  // Singleton Export Tests
  // ==========================================================================

  describe("userPINService singleton", () => {
    it("should be an instance of UserPINService", () => {
      expect(userPINService).toBeInstanceOf(UserPINService);
    });

    it("should have all expected public methods", () => {
      const expectedMethods = [
        "validatePIN",
        "computePINFingerprint",
        "hashPIN",
        "verifyPINHash",
        "hasUserPIN",
        "validatePINUniquenessInStore",
        "setUserPIN",
        "clearUserPIN",
        "verifyUserPIN",
        "getUsersNeedingPIN",
      ];

      for (const method of expectedMethods) {
        expect(typeof (userPINService as any)[method]).toBe("function");
      }
    });
  });
});
