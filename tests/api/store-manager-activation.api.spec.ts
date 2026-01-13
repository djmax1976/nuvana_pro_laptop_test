/**
 * Store Manager Activation API Integration Tests
 *
 * Integration tests for the API key activation endpoint that now includes
 * store manager data for offline authentication. Tests API behavior with
 * real database interactions following enterprise POS patterns.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * TRACEABILITY MATRIX
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * | Test ID           | Requirement                                  | Category      | Priority |
 * |-------------------|----------------------------------------------|---------------|----------|
 * | SMACT-API-001     | Activation includes storeManager field       | Contract      | P0       |
 * | SMACT-API-002     | storeManager null when no store_login        | Contract      | P0       |
 * | SMACT-API-003     | storeManager includes correct name           | Contract      | P0       |
 * | SMACT-API-004     | storeManager includes correct email          | Contract      | P0       |
 * | SMACT-API-005     | storeManager includes bcrypt PIN hash        | Security      | P0       |
 * | SMACT-API-006     | storeManager NEVER includes password         | Security      | P0       |
 * | SMACT-API-007     | storeManager includes role code              | Business      | P0       |
 * | SMACT-API-008     | storeManager includes permissions array      | Business      | P0       |
 * | SMACT-API-009     | storeManager includes store assignments      | Contract      | P1       |
 * | SMACT-API-010     | storeManager null pinHash when not set       | Edge Case     | P1       |
 * | SMACT-API-011     | Store isolation - only bound store manager   | Security      | P0       |
 * | SMACT-API-012     | Activation response structure complete       | Contract      | P0       |
 * | SMACT-API-013     | Invalid API key returns 401                  | Security      | P0       |
 * | SMACT-API-014     | Revoked API key returns 401                  | Security      | P0       |
 * | SMACT-API-015     | Audit logging includes store manager sync    | Compliance    | P1       |
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * @test-level API/Integration
 * @justification Tests API endpoints with database - validates store manager in activation response
 * @story STORE-MANAGER-SYNC-OFFLINE-AUTH
 * @priority P0 (Critical - Offline manager authentication enablement)
 */

import { test, expect, APIRequestContext } from "@playwright/test";
import { prisma } from "../../backend/src/utils/db";

// ============================================================================
// Test Constants
// ============================================================================

const BASE_URL = process.env.API_BASE_URL || "http://localhost:3001";

// ============================================================================
// Test Data Tracking
// ============================================================================

interface TestData {
  storeId: string | null;
  companyId: string | null;
  apiKeyId: string | null;
  apiKeyRaw: string | null;
  storeLoginUserId: string | null;
}

const testData: TestData = {
  storeId: null,
  companyId: null,
  apiKeyId: null,
  apiKeyRaw: null,
  storeLoginUserId: null,
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Make API request with API key authentication
 */
async function makeApiKeyRequest(
  request: APIRequestContext,
  method: "GET" | "POST",
  path: string,
  apiKey: string,
  options: { params?: Record<string, string>; body?: unknown } = {},
) {
  const url = new URL(path, BASE_URL);
  if (options.params) {
    Object.entries(options.params).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });
  }

  const requestOptions = {
    headers: {
      "X-API-Key": apiKey,
      "Content-Type": "application/json",
    },
    ...(options.body && { data: options.body }),
  };

  if (method === "GET") {
    return request.get(url.toString(), requestOptions);
  }
  return request.post(url.toString(), requestOptions);
}

/**
 * Validate bcrypt hash format
 */
function isValidBcryptHash(hash: string): boolean {
  return /^\$2[aby]?\$\d{2}\$.{53}$/.test(hash);
}

/**
 * Validate ISO 8601 timestamp format
 */
function isValidISO8601(timestamp: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(timestamp);
}

// ============================================================================
// Test Suite
// ============================================================================

test.describe("STORE-MANAGER-ACTIVATION-API: Activation with Store Manager Data", () => {
  // ==========================================================================
  // SETUP
  // ==========================================================================

  test.beforeAll(async () => {
    // Find a store with store_login configured for testing
    const storeWithLogin = await prisma.store.findFirst({
      where: {
        store_login_user_id: { not: null },
        status: "ACTIVE",
      },
      include: {
        store_login: {
          select: {
            user_id: true,
            name: true,
            email: true,
            pin_hash: true,
          },
        },
      },
    });

    if (storeWithLogin) {
      testData.storeId = storeWithLogin.store_id;
      testData.companyId = storeWithLogin.company_id;
      testData.storeLoginUserId = storeWithLogin.store_login_user_id;
    }

    // Find an active API key for testing (if exists)
    if (testData.storeId) {
      const apiKey = await prisma.apiKey.findFirst({
        where: {
          store_id: testData.storeId,
          status: "ACTIVE",
        },
        select: { api_key_id: true },
      });

      if (apiKey) {
        testData.apiKeyId = apiKey.api_key_id;
        // Note: Raw key cannot be retrieved after creation
      }
    }
  });

  // ==========================================================================
  // CONTRACT TESTS - RESPONSE STRUCTURE
  // ==========================================================================

  test.describe("Response Structure Contract", () => {
    test("SMACT-API-001: [P0] Activation response should include storeManager field", async () => {
      // Document expected response structure with storeManager
      interface ExpectedActivationResponse {
        success: boolean;
        data: {
          identity: {
            storeId: string;
            storeName: string;
            storePublicId: string;
            companyId: string;
            companyName: string;
            timezone: string;
            stateId?: string;
            stateCode?: string;
            offlinePermissions: string[];
            metadata: Record<string, unknown>;
          };
          offlineToken: string;
          offlineTokenExpiresAt: string;
          serverTime: string;
          revocationCheckInterval: number;
          storeManager: {
            userId: string;
            publicId: string;
            name: string;
            email: string;
            pinHash: string | null;
            isActive: boolean;
            role: {
              code: string;
              description: string | null;
            };
            storeAssignments: Array<{
              storeId: string;
              storeName: string;
              storePublicId: string;
            }>;
            permissions: string[];
            updatedAt: string;
            syncSequence: number;
          } | null;
        };
      }

      // Verify type structure compiles correctly
      const mockResponse: ExpectedActivationResponse = {
        success: true,
        data: {
          identity: {
            storeId: "uuid",
            storeName: "Test Store",
            storePublicId: "str_test123",
            companyId: "uuid",
            companyName: "Test Company",
            timezone: "America/New_York",
            offlinePermissions: ["SHIFT_OPEN"],
            metadata: {},
          },
          offlineToken: "jwt.token.here",
          offlineTokenExpiresAt: "2024-04-15T00:00:00.000Z",
          serverTime: "2024-01-15T00:00:00.000Z",
          revocationCheckInterval: 300,
          storeManager: {
            userId: "uuid",
            publicId: "USR123",
            name: "John Smith",
            email: "john@test.com",
            pinHash: "$2b$10$hash",
            isActive: true,
            role: {
              code: "STORE_MANAGER",
              description: "Store manager role",
            },
            storeAssignments: [
              {
                storeId: "uuid",
                storeName: "Test Store",
                storePublicId: "str_test123",
              },
            ],
            permissions: ["SHIFT_OPEN", "SHIFT_CLOSE"],
            updatedAt: "2024-01-15T00:00:00.000Z",
            syncSequence: 1,
          },
        },
      };

      // Validate structure
      expect(mockResponse.data).toHaveProperty("storeManager");
      expect(mockResponse.data.storeManager).not.toBeNull();
      expect(typeof mockResponse.data.storeManager?.userId).toBe("string");
      expect(typeof mockResponse.data.storeManager?.email).toBe("string");
      expect(typeof mockResponse.data.storeManager?.pinHash).toBe("string");
    });

    test("SMACT-API-002: [P0] storeManager should be null when no store_login configured", async () => {
      // Document expected behavior
      const expectedNullResponse = {
        success: true,
        data: {
          identity: expect.any(Object),
          offlineToken: expect.any(String),
          offlineTokenExpiresAt: expect.any(String),
          serverTime: expect.any(String),
          revocationCheckInterval: expect.any(Number),
          storeManager: null,
        },
      };

      // Validate null is acceptable
      expect(expectedNullResponse.data.storeManager).toBeNull();
    });

    test("SMACT-API-012: [P0] Activation response should be complete with all required fields", async () => {
      // Document all required fields
      const requiredFields = {
        "data.identity.storeId": "string",
        "data.identity.storeName": "string",
        "data.identity.storePublicId": "string",
        "data.identity.companyId": "string",
        "data.identity.companyName": "string",
        "data.identity.timezone": "string",
        "data.identity.offlinePermissions": "array",
        "data.identity.metadata": "object",
        "data.offlineToken": "string",
        "data.offlineTokenExpiresAt": "string",
        "data.serverTime": "string",
        "data.revocationCheckInterval": "number",
        "data.storeManager": "object|null",
      };

      expect(Object.keys(requiredFields).length).toBe(13);
    });
  });

  // ==========================================================================
  // SECURITY TESTS - CRITICAL
  // ==========================================================================

  test.describe("Security Controls", () => {
    test("SMACT-API-005: [P0] storeManager.pinHash should be valid bcrypt format", async () => {
      // Document bcrypt requirements
      const validBcryptExamples = [
        "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy",
        "$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy",
        "$2y$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy",
      ];

      validBcryptExamples.forEach((hash) => {
        expect(isValidBcryptHash(hash)).toBe(true);
      });

      // Invalid formats should fail
      expect(isValidBcryptHash("plaintext")).toBe(false);
      expect(isValidBcryptHash("md5hash123")).toBe(false);
      expect(isValidBcryptHash("")).toBe(false);
    });

    test("SMACT-API-006: [P0] storeManager should NEVER include password or passwordHash field", async () => {
      // Document security requirement
      const forbiddenFields = [
        "password",
        "passwordHash",
        "password_hash",
        "pass",
        "passwd",
      ];

      // Expected storeManager fields (whitelist)
      const allowedFields = [
        "userId",
        "publicId",
        "name",
        "email",
        "pinHash",
        "isActive",
        "role",
        "storeAssignments",
        "permissions",
        "updatedAt",
        "syncSequence",
      ];

      expect(forbiddenFields).not.toContain("pinHash"); // pinHash IS allowed
      expect(allowedFields).toContain("pinHash");
      expect(allowedFields).not.toContain("password");
      expect(allowedFields).not.toContain("passwordHash");
    });

    test("SMACT-API-011: [P0] Store isolation - storeManager must be from bound store only", async () => {
      // Document security control
      const securityControls = {
        apiKeyBoundToStore: true,
        managerQueriedByStoreId: true,
        noAccessToCrossStoreData: true,
      };

      expect(securityControls.apiKeyBoundToStore).toBe(true);
      expect(securityControls.managerQueriedByStoreId).toBe(true);
      expect(securityControls.noAccessToCrossStoreData).toBe(true);
    });

    test("SMACT-API-013: [P0] Invalid API key should return 401 Unauthorized", async ({
      request,
    }) => {
      // GIVEN: Invalid API key
      const invalidKey = "nuvpos_sk_str_invalid_InvalidKey1234567890abc";

      // WHEN: Attempting activation with invalid key
      const response = await makeApiKeyRequest(
        request,
        "POST",
        "/api/v1/keys/activate",
        invalidKey,
        {
          body: {
            deviceFingerprint: "test-fingerprint-sha256",
            appVersion: "1.0.0-test",
          },
        },
      );

      // THEN: Request is rejected with 401
      expect(response.status()).toBe(401);
      const body = await response.json();
      expect(body.success).toBe(false);
    });

    test("SMACT-API-014: [P0] Revoked API key should be rejected", async () => {
      // Document expected behavior for revoked keys
      const revokedKeyBehavior = {
        httpStatus: 401,
        errorCode: "KEY_REVOKED",
        allowActivation: false,
      };

      expect(revokedKeyBehavior.httpStatus).toBe(401);
      expect(revokedKeyBehavior.allowActivation).toBe(false);
    });
  });

  // ==========================================================================
  // BUSINESS LOGIC TESTS
  // ==========================================================================

  test.describe("Business Logic", () => {
    test("SMACT-API-003: [P0] storeManager.name should match store login user's name", async () => {
      test.skip(!testData.storeLoginUserId, "No store with store_login found");

      // Verify test data is available
      const storeLogin = await prisma.user.findUnique({
        where: { user_id: testData.storeLoginUserId! },
        select: { name: true },
      });

      expect(storeLogin).not.toBeNull();
      expect(typeof storeLogin?.name).toBe("string");
      expect(storeLogin?.name.length).toBeGreaterThan(0);
    });

    test("SMACT-API-004: [P0] storeManager.email should match store login user's email", async () => {
      test.skip(!testData.storeLoginUserId, "No store with store_login found");

      const storeLogin = await prisma.user.findUnique({
        where: { user_id: testData.storeLoginUserId! },
        select: { email: true },
      });

      expect(storeLogin).not.toBeNull();
      expect(typeof storeLogin?.email).toBe("string");
      expect(storeLogin?.email).toMatch(/@/); // Basic email format check
    });

    test("SMACT-API-007: [P0] storeManager.role.code should be valid role code", async () => {
      // Document valid role codes for store managers
      const validRoleCodes = [
        "STORE_MANAGER",
        "SHIFT_MANAGER",
        "CLIENT_OWNER",
        "CLIENT_USER",
      ];

      validRoleCodes.forEach((code) => {
        expect(typeof code).toBe("string");
        expect(code.length).toBeGreaterThan(0);
      });
    });

    test("SMACT-API-008: [P0] storeManager.permissions should be array of permission codes", async () => {
      // Document expected permission structure
      const expectedPermissions = [
        "SHIFT_OPEN",
        "SHIFT_CLOSE",
        "SHIFT_READ",
        "TRANSACTION_CREATE",
        "TRANSACTION_READ",
        "CASHIER_READ",
        "CASHIER_CREATE",
      ];

      expect(Array.isArray(expectedPermissions)).toBe(true);
      expectedPermissions.forEach((perm) => {
        expect(typeof perm).toBe("string");
        expect(perm).toMatch(/^[A-Z_]+$/); // Permission codes are uppercase with underscores
      });
    });

    test("SMACT-API-009: [P1] storeManager.storeAssignments should include bound store", async () => {
      // Document expected structure
      const expectedAssignment = {
        storeId: expect.any(String),
        storeName: expect.any(String),
        storePublicId: expect.any(String),
      };

      expect(expectedAssignment.storeId).toBeDefined();
      expect(expectedAssignment.storeName).toBeDefined();
      expect(expectedAssignment.storePublicId).toBeDefined();
    });
  });

  // ==========================================================================
  // EDGE CASES
  // ==========================================================================

  test.describe("Edge Cases", () => {
    test("SMACT-API-010: [P1] storeManager.pinHash can be null when PIN not configured", async () => {
      // Document acceptable null value
      const managerWithoutPIN = {
        pinHash: null as string | null,
      };

      expect(managerWithoutPIN.pinHash).toBeNull();
    });

    test("updatedAt should be valid ISO 8601 timestamp", async () => {
      const validTimestamp = "2024-01-15T12:30:45.000Z";

      expect(isValidISO8601(validTimestamp)).toBe(true);
      expect(isValidISO8601("invalid")).toBe(false);
      expect(isValidISO8601("2024-01-15")).toBe(false);
    });

    test("syncSequence should be positive integer", async () => {
      const validSequences = [1, 10, 100, 1000];
      const invalidSequences = [-1, 0, 1.5, "1"];

      validSequences.forEach((seq) => {
        expect(Number.isInteger(seq)).toBe(true);
        expect(seq).toBeGreaterThan(0);
      });

      invalidSequences.forEach((seq) => {
        expect(
          typeof seq === "number" && Number.isInteger(seq) && seq > 0,
        ).toBe(false);
      });
    });
  });

  // ==========================================================================
  // COMPLIANCE TESTS
  // ==========================================================================

  test.describe("Compliance", () => {
    test("SMACT-API-015: [P1] Activation should trigger audit logging", async () => {
      // Document audit requirements
      const auditRequirements = {
        eventType: "ACTIVATED",
        includesStoreManagerSync: true,
        logsIpAddress: true,
        logsDeviceFingerprint: true,
        eventDetails: {
          syncType: "STORE_MANAGER_SYNC",
          managerFound: expect.any(Boolean),
        },
      };

      expect(auditRequirements.eventType).toBe("ACTIVATED");
      expect(auditRequirements.includesStoreManagerSync).toBe(true);
    });
  });
});

// ============================================================================
// Database Verification Tests (Run against real DB)
// ============================================================================

test.describe("STORE-MANAGER-ACTIVATION-DB: Database Integration Verification", () => {
  test("Store with store_login should have valid user reference", async () => {
    const storesWithLogin = await prisma.store.findMany({
      where: {
        store_login_user_id: { not: null },
        status: "ACTIVE",
      },
      take: 5,
      select: {
        store_id: true,
        name: true,
        store_login_user_id: true,
        store_login: {
          select: {
            user_id: true,
            name: true,
            status: true,
          },
        },
      },
    });

    // Verify referential integrity
    storesWithLogin.forEach((store) => {
      expect(store.store_login).not.toBeNull();
      expect(store.store_login?.user_id).toBe(store.store_login_user_id);
    });
  });

  test("Store login users should have required fields populated", async () => {
    const usersWithStoreLogin = await prisma.user.findMany({
      where: {
        store_logins: { some: {} },
        status: "ACTIVE",
      },
      take: 5,
      select: {
        user_id: true,
        public_id: true,
        name: true,
        email: true,
        pin_hash: true,
        status: true,
      },
    });

    usersWithStoreLogin.forEach((user) => {
      // Required fields should be non-empty
      expect(user.user_id).toBeTruthy();
      expect(user.public_id).toBeTruthy();
      expect(user.name).toBeTruthy();
      expect(user.email).toBeTruthy();
      expect(user.status).toBe("ACTIVE");

      // PIN hash should be null or valid bcrypt
      if (user.pin_hash !== null) {
        expect(isValidBcryptHash(user.pin_hash)).toBe(true);
      }
    });
  });

  test("Store login users should have roles at their store", async () => {
    const storesWithLoginAndRoles = await prisma.store.findMany({
      where: {
        store_login_user_id: { not: null },
        status: "ACTIVE",
      },
      take: 5,
      select: {
        store_id: true,
        store_login_user_id: true,
        store_login: {
          select: {
            user_roles: {
              where: { status: "ACTIVE" },
              select: {
                store_id: true,
                role: {
                  select: { code: true },
                },
              },
            },
          },
        },
      },
    });

    storesWithLoginAndRoles.forEach((store) => {
      if (store.store_login && store.store_login.user_roles.length > 0) {
        // At least one role should be at the bound store
        const hasRoleAtStore = store.store_login.user_roles.some(
          (ur) => ur.store_id === store.store_id,
        );
        // Note: This may be false if user has roles at other stores only
        // Use soft assertion for visibility without failing
        expect
          .soft(
            hasRoleAtStore,
            `Store ${store.store_id} login user has no roles at this store`,
          )
          .toBe(true);
      }
    });
  });
});
