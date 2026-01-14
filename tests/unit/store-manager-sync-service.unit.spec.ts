/**
 * Store Manager Sync Service Unit Tests
 *
 * Unit tests for store manager data synchronization service following enterprise
 * POS patterns for offline manager authentication (NCR Aloha, Microsoft Dynamics 365,
 * Oracle MICROS).
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * TRACEABILITY MATRIX
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * | Test ID           | Requirement                              | Category      | Priority |
 * |-------------------|------------------------------------------|---------------|----------|
 * | SMSYNC-U-001      | Returns manager when store_login exists  | Happy Path    | P0       |
 * | SMSYNC-U-002      | Returns null when no store_login         | Happy Path    | P0       |
 * | SMSYNC-U-003      | Returns null when store not found        | Edge Case     | P1       |
 * | SMSYNC-U-004      | Includes bcrypt PIN hash in response     | Security      | P0       |
 * | SMSYNC-U-005      | NEVER includes password_hash             | Security      | P0       |
 * | SMSYNC-U-006      | Store isolation - only bound store       | Security      | P0       |
 * | SMSYNC-U-007      | Returns correct role code                | Business      | P0       |
 * | SMSYNC-U-008      | Returns correct role description         | Business      | P1       |
 * | SMSYNC-U-009      | Aggregates permissions from all roles    | Business      | P0       |
 * | SMSYNC-U-010      | Only includes roles for bound store      | Security      | P0       |
 * | SMSYNC-U-011      | Returns correct isActive status          | Business      | P0       |
 * | SMSYNC-U-012      | isActive false when user status INACTIVE | Business      | P1       |
 * | SMSYNC-U-013      | Returns null pinHash when not set        | Edge Case     | P1       |
 * | SMSYNC-U-014      | Store assignments include correct data   | Contract      | P0       |
 * | SMSYNC-U-015      | Response structure matches interface     | Contract      | P0       |
 * | SMSYNC-U-016      | ISO 8601 updatedAt timestamp             | Contract      | P1       |
 * | SMSYNC-U-017      | Sync sequence number assigned            | Business      | P1       |
 * | SMSYNC-U-018      | Audit logging on activation sync         | Compliance    | P1       |
 * | SMSYNC-U-019      | Handles user with no roles gracefully    | Edge Case     | P2       |
 * | SMSYNC-U-020      | Email is included in response            | Contract      | P0       |
 * | SMSYNC-U-021      | Public ID is included in response        | Contract      | P0       |
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * @test-level Unit
 * @justification Unit tests for store manager sync service logic with mocked dependencies
 * @story STORE-MANAGER-SYNC-OFFLINE-AUTH
 * @priority P0 (Critical - Offline manager authentication enablement)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type {
  StoreManagerSyncRecord,
  ApiKeyIdentity,
} from "../../backend/src/types/api-key.types";

// ============================================================================
// Mock Setup
// ============================================================================

// Mock Prisma client
const mockPrismaClient = {
  store: {
    findUnique: vi.fn(),
  },
  apiKeyAuditEvent: {
    create: vi.fn(),
  },
};

// Mock the db module
vi.mock("../../backend/src/utils/db", () => ({
  prisma: mockPrismaClient,
}));

// Mock audit service
vi.mock("../../backend/src/services/api-key/api-key-audit.service", () => ({
  apiKeyAuditService: {
    logCustomEvent: vi.fn().mockResolvedValue(undefined),
  },
}));

// ============================================================================
// Test Data Factories
// ============================================================================

/**
 * Create mock API key identity
 * Simulates the identity attached to request after middleware validation
 */
const createMockApiKeyIdentity = (
  overrides: Partial<ApiKeyIdentity> = {},
): ApiKeyIdentity => ({
  apiKeyId: "test-api-key-id-123",
  storeId: "test-store-id-456",
  storeName: "Test Store",
  storePublicId: "str_teststore123",
  companyId: "test-company-id-789",
  companyName: "Test Company",
  timezone: "America/New_York",
  offlinePermissions: ["SHIFT_OPEN", "TRANSACTION_CREATE"],
  metadata: {},
  isElevated: false as const,
  ...overrides,
});

/**
 * Create mock permission for role_permissions relation
 */
const createMockRolePermission = (code: string) => ({
  permission: { code },
});

/**
 * Create mock role with permissions
 */
const createMockRole = (overrides: Record<string, unknown> = {}) => ({
  code: "STORE_MANAGER",
  description:
    "Store manager with full access to store operations and management",
  role_permissions: [
    createMockRolePermission("SHIFT_OPEN"),
    createMockRolePermission("SHIFT_CLOSE"),
    createMockRolePermission("TRANSACTION_CREATE"),
    createMockRolePermission("TRANSACTION_READ"),
    createMockRolePermission("CASHIER_READ"),
    createMockRolePermission("CASHIER_CREATE"),
  ],
  ...overrides,
});

/**
 * Create mock user role (UserRole join record)
 */
const createMockUserRole = (
  storeId: string,
  roleOverrides: Record<string, unknown> = {},
) => ({
  status: "ACTIVE",
  store_id: storeId,
  role: createMockRole(roleOverrides),
});

/**
 * Create mock store login user
 */
const createMockStoreLoginUser = (
  storeId: string,
  overrides: Record<string, unknown> = {},
) => ({
  user_id: "user-id-abc123",
  public_id: "USR_MGR001",
  name: "John Smith",
  email: "john.smith@teststore.com",
  status: "ACTIVE",
  pin_hash: "$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZRGdjGj/n3.P1q2xTcK2K5K5K5K5K" as
    | string
    | null,
  // NOTE: password_hash should NEVER be included in select
  updated_at: new Date("2024-01-15T12:00:00.000Z"),
  user_roles: [createMockUserRole(storeId)],
  ...overrides,
});

/**
 * Create mock store with store_login
 */
const createMockStore = (overrides: Record<string, unknown> = {}) => {
  const storeId = "test-store-id-456";
  return {
    store_id: storeId,
    name: "Test Store",
    public_id: "str_teststore123",
    store_login_user_id: "user-id-abc123",
    store_login: createMockStoreLoginUser(storeId),
    ...overrides,
  };
};

/**
 * Create mock store without store_login
 */
const createMockStoreWithoutLogin = () => ({
  store_id: "test-store-id-456",
  name: "Test Store",
  public_id: "str_teststore123",
  store_login_user_id: null,
  store_login: null,
});

// ============================================================================
// Helper: Validate StoreManagerSyncRecord Structure
// ============================================================================

const validateSyncRecordStructure = (record: StoreManagerSyncRecord) => {
  // Required string fields
  expect(typeof record.userId).toBe("string");
  expect(typeof record.publicId).toBe("string");
  expect(typeof record.name).toBe("string");
  expect(typeof record.email).toBe("string");
  expect(typeof record.updatedAt).toBe("string");

  // Required boolean field
  expect(typeof record.isActive).toBe("boolean");

  // Required number field
  expect(typeof record.syncSequence).toBe("number");

  // Nullable string field
  expect(record.pinHash === null || typeof record.pinHash === "string").toBe(
    true,
  );

  // Role object structure
  expect(record.role).toHaveProperty("code");
  expect(record.role).toHaveProperty("description");
  expect(typeof record.role.code).toBe("string");
  expect(
    record.role.description === null ||
      typeof record.role.description === "string",
  ).toBe(true);

  // Store assignments array
  expect(Array.isArray(record.storeAssignments)).toBe(true);
  if (record.storeAssignments.length > 0) {
    const assignment = record.storeAssignments[0];
    expect(typeof assignment.storeId).toBe("string");
    expect(typeof assignment.storeName).toBe("string");
    expect(typeof assignment.storePublicId).toBe("string");
  }

  // Permissions array
  expect(Array.isArray(record.permissions)).toBe(true);
  record.permissions.forEach((perm) => {
    expect(typeof perm).toBe("string");
  });
};

// ============================================================================
// Tests
// ============================================================================

describe("Store Manager Sync Service Unit Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // ==========================================================================
  // HAPPY PATH TESTS
  // ==========================================================================

  describe("Happy Path - Store Manager Retrieval", () => {
    it("SMSYNC-U-001: [P0] should return manager record when store_login exists", async () => {
      // GIVEN: Store has a store_login user configured
      const mockStore = createMockStore();
      mockPrismaClient.store.findUnique.mockResolvedValue(mockStore);

      // Import service after mocks are set up
      const { storeManagerSyncService } =
        await import("../../backend/src/services/api-key/store-manager-sync.service");

      // WHEN: Getting store manager for sync
      const result = await storeManagerSyncService.getStoreManagerForSync(
        mockStore.store_id,
      );

      // THEN: Manager record is returned
      expect(result).not.toBeNull();
      expect(result?.userId).toBe(mockStore.store_login.user_id);
      expect(result?.name).toBe(mockStore.store_login.name);
    });

    it("SMSYNC-U-002: [P0] should return null when no store_login configured", async () => {
      // GIVEN: Store has no store_login user
      const mockStore = createMockStoreWithoutLogin();
      mockPrismaClient.store.findUnique.mockResolvedValue(mockStore);

      const { storeManagerSyncService } =
        await import("../../backend/src/services/api-key/store-manager-sync.service");

      // WHEN: Getting store manager for sync
      const result = await storeManagerSyncService.getStoreManagerForSync(
        mockStore.store_id,
      );

      // THEN: Null is returned
      expect(result).toBeNull();
    });

    it("SMSYNC-U-003: [P1] should return null when store not found", async () => {
      // GIVEN: Store does not exist
      mockPrismaClient.store.findUnique.mockResolvedValue(null);

      const { storeManagerSyncService } =
        await import("../../backend/src/services/api-key/store-manager-sync.service");

      // WHEN: Getting store manager for non-existent store
      const result = await storeManagerSyncService.getStoreManagerForSync(
        "non-existent-store-id",
      );

      // THEN: Null is returned
      expect(result).toBeNull();
    });
  });

  // ==========================================================================
  // SECURITY TESTS - CRITICAL
  // ==========================================================================

  describe("Security Controls", () => {
    it("SMSYNC-U-004: [P0] should include bcrypt PIN hash in response", async () => {
      // GIVEN: Store manager has PIN configured
      const pinHash =
        "$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZRGdjGj/n3.P1q2xTcK2K5K5K5K5K";
      const mockStore = createMockStore();
      mockStore.store_login.pin_hash = pinHash;
      mockPrismaClient.store.findUnique.mockResolvedValue(mockStore);

      const { storeManagerSyncService } =
        await import("../../backend/src/services/api-key/store-manager-sync.service");

      // WHEN: Getting store manager for sync
      const result = await storeManagerSyncService.getStoreManagerForSync(
        mockStore.store_id,
      );

      // THEN: PIN hash is included
      expect(result?.pinHash).toBe(pinHash);
      // AND: It's a valid bcrypt hash format
      expect(result?.pinHash).toMatch(/^\$2[aby]?\$\d{2}\$.{53}$/);
    });

    it("SMSYNC-U-005: [P0] should NEVER include password_hash in response", async () => {
      // GIVEN: Store manager exists
      const mockStore = createMockStore();
      // Simulate if password_hash was accidentally included in the record
      (mockStore.store_login as Record<string, unknown>).password_hash =
        "$2b$10$SHOULD_NOT_BE_RETURNED";
      mockPrismaClient.store.findUnique.mockResolvedValue(mockStore);

      const { storeManagerSyncService } =
        await import("../../backend/src/services/api-key/store-manager-sync.service");

      // WHEN: Getting store manager for sync
      const result = await storeManagerSyncService.getStoreManagerForSync(
        mockStore.store_id,
      );

      // THEN: Result does NOT contain password_hash field
      expect(result).not.toBeNull();
      expect(result).not.toHaveProperty("passwordHash");
      expect(result).not.toHaveProperty("password_hash");

      // AND: Only expected fields are present
      const resultKeys = Object.keys(result!);
      expect(resultKeys).not.toContain("passwordHash");
      expect(resultKeys).not.toContain("password_hash");
    });

    it("SMSYNC-U-006: [P0] should enforce store isolation via store_id parameter", async () => {
      // GIVEN: Store exists with manager
      const mockStore = createMockStore();
      mockPrismaClient.store.findUnique.mockResolvedValue(mockStore);

      const { storeManagerSyncService } =
        await import("../../backend/src/services/api-key/store-manager-sync.service");

      // WHEN: Getting store manager
      await storeManagerSyncService.getStoreManagerForSync(mockStore.store_id);

      // THEN: Query is filtered by store_id
      expect(mockPrismaClient.store.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { store_id: mockStore.store_id },
        }),
      );
    });

    it("SMSYNC-U-010: [P0] should only include roles for the bound store", async () => {
      // GIVEN: User has roles at multiple stores but query filters by store_id
      const storeId = "test-store-id-456";
      const mockStore = createMockStore();

      // Verify the mock includes store-scoped role query
      mockPrismaClient.store.findUnique.mockResolvedValue(mockStore);

      const { storeManagerSyncService } =
        await import("../../backend/src/services/api-key/store-manager-sync.service");

      // WHEN: Getting store manager
      await storeManagerSyncService.getStoreManagerForSync(storeId);

      // THEN: Query includes user_roles filter for store_id
      expect(mockPrismaClient.store.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          select: expect.objectContaining({
            store_login: expect.objectContaining({
              select: expect.objectContaining({
                user_roles: expect.objectContaining({
                  where: expect.objectContaining({
                    store_id: storeId,
                  }),
                }),
              }),
            }),
          }),
        }),
      );
    });
  });

  // ==========================================================================
  // BUSINESS LOGIC TESTS
  // ==========================================================================

  describe("Business Logic", () => {
    it("SMSYNC-U-007: [P0] should return correct role code", async () => {
      // GIVEN: Store manager with STORE_MANAGER role
      const mockStore = createMockStore();
      mockPrismaClient.store.findUnique.mockResolvedValue(mockStore);

      const { storeManagerSyncService } =
        await import("../../backend/src/services/api-key/store-manager-sync.service");

      // WHEN: Getting store manager
      const result = await storeManagerSyncService.getStoreManagerForSync(
        mockStore.store_id,
      );

      // THEN: Role code is correct
      expect(result?.role.code).toBe("STORE_MANAGER");
    });

    it("SMSYNC-U-008: [P1] should return correct role description", async () => {
      // GIVEN: Store manager with role description
      const mockStore = createMockStore();
      mockPrismaClient.store.findUnique.mockResolvedValue(mockStore);

      const { storeManagerSyncService } =
        await import("../../backend/src/services/api-key/store-manager-sync.service");

      // WHEN: Getting store manager
      const result = await storeManagerSyncService.getStoreManagerForSync(
        mockStore.store_id,
      );

      // THEN: Role description is included
      expect(result?.role.description).toBe(
        "Store manager with full access to store operations and management",
      );
    });

    it("SMSYNC-U-009: [P0] should aggregate permissions from all roles at the store", async () => {
      // GIVEN: User has multiple roles at the store with different permissions
      const storeId = "test-store-id-456";
      const mockStore = createMockStore();

      // Add second role with additional permissions
      mockStore.store_login.user_roles.push({
        status: "ACTIVE",
        store_id: storeId,
        role: {
          code: "SHIFT_MANAGER",
          description: "Shift manager role",
          role_permissions: [
            createMockRolePermission("SHIFT_RECONCILE"),
            createMockRolePermission("REPORT_DAILY"),
            // Duplicate permission to test deduplication
            createMockRolePermission("SHIFT_OPEN"),
          ],
        },
      });

      mockPrismaClient.store.findUnique.mockResolvedValue(mockStore);

      const { storeManagerSyncService } =
        await import("../../backend/src/services/api-key/store-manager-sync.service");

      // WHEN: Getting store manager
      const result = await storeManagerSyncService.getStoreManagerForSync(
        mockStore.store_id,
      );

      // THEN: All unique permissions are aggregated
      expect(result?.permissions).toContain("SHIFT_OPEN");
      expect(result?.permissions).toContain("SHIFT_CLOSE");
      expect(result?.permissions).toContain("SHIFT_RECONCILE");
      expect(result?.permissions).toContain("REPORT_DAILY");
      expect(result?.permissions).toContain("TRANSACTION_CREATE");

      // AND: No duplicates
      const uniquePermissions = new Set(result?.permissions);
      expect(uniquePermissions.size).toBe(result?.permissions.length);
    });

    it("SMSYNC-U-011: [P0] should return isActive true when user status is ACTIVE", async () => {
      // GIVEN: User with ACTIVE status
      const mockStore = createMockStore();
      mockStore.store_login.status = "ACTIVE";
      mockPrismaClient.store.findUnique.mockResolvedValue(mockStore);

      const { storeManagerSyncService } =
        await import("../../backend/src/services/api-key/store-manager-sync.service");

      // WHEN: Getting store manager
      const result = await storeManagerSyncService.getStoreManagerForSync(
        mockStore.store_id,
      );

      // THEN: isActive is true
      expect(result?.isActive).toBe(true);
    });

    it("SMSYNC-U-012: [P1] should return isActive false when user status is not ACTIVE", async () => {
      // GIVEN: User with INACTIVE status
      const mockStore = createMockStore();
      mockStore.store_login.status = "INACTIVE";
      mockPrismaClient.store.findUnique.mockResolvedValue(mockStore);

      const { storeManagerSyncService } =
        await import("../../backend/src/services/api-key/store-manager-sync.service");

      // WHEN: Getting store manager
      const result = await storeManagerSyncService.getStoreManagerForSync(
        mockStore.store_id,
      );

      // THEN: isActive is false
      expect(result?.isActive).toBe(false);
    });

    it("SMSYNC-U-017: [P1] should assign sync sequence number", async () => {
      // GIVEN: Store manager exists
      const mockStore = createMockStore();
      mockPrismaClient.store.findUnique.mockResolvedValue(mockStore);

      const { storeManagerSyncService } =
        await import("../../backend/src/services/api-key/store-manager-sync.service");

      // WHEN: Getting store manager with custom sequence
      const result = await storeManagerSyncService.getStoreManagerForSync(
        mockStore.store_id,
        5,
      );

      // THEN: Sequence number is assigned
      expect(result?.syncSequence).toBe(5);
    });
  });

  // ==========================================================================
  // EDGE CASES
  // ==========================================================================

  describe("Edge Cases", () => {
    it("SMSYNC-U-013: [P1] should return null pinHash when PIN not configured", async () => {
      // GIVEN: User has no PIN set
      const mockStore = createMockStore();
      mockStore.store_login.pin_hash = null;
      mockPrismaClient.store.findUnique.mockResolvedValue(mockStore);

      const { storeManagerSyncService } =
        await import("../../backend/src/services/api-key/store-manager-sync.service");

      // WHEN: Getting store manager
      const result = await storeManagerSyncService.getStoreManagerForSync(
        mockStore.store_id,
      );

      // THEN: pinHash is null (not undefined)
      expect(result?.pinHash).toBeNull();
    });

    it("SMSYNC-U-019: [P2] should handle user with no roles gracefully", async () => {
      // GIVEN: User has no roles at this store
      const mockStore = createMockStore();
      mockStore.store_login.user_roles = [];
      mockPrismaClient.store.findUnique.mockResolvedValue(mockStore);

      const { storeManagerSyncService } =
        await import("../../backend/src/services/api-key/store-manager-sync.service");

      // WHEN: Getting store manager
      const result = await storeManagerSyncService.getStoreManagerForSync(
        mockStore.store_id,
      );

      // THEN: Record is returned with UNKNOWN role
      expect(result).not.toBeNull();
      expect(result?.role.code).toBe("UNKNOWN");
      expect(result?.role.description).toBeNull();
      expect(result?.permissions).toEqual([]);
    });
  });

  // ==========================================================================
  // CONTRACT TESTS
  // ==========================================================================

  describe("Response Contract", () => {
    it("SMSYNC-U-015: [P0] should return complete StoreManagerSyncRecord structure", async () => {
      // GIVEN: Store manager exists
      const mockStore = createMockStore();
      mockPrismaClient.store.findUnique.mockResolvedValue(mockStore);

      const { storeManagerSyncService } =
        await import("../../backend/src/services/api-key/store-manager-sync.service");

      // WHEN: Getting store manager
      const result = await storeManagerSyncService.getStoreManagerForSync(
        mockStore.store_id,
      );

      // THEN: Response matches interface structure
      expect(result).not.toBeNull();
      validateSyncRecordStructure(result!);
    });

    it("SMSYNC-U-014: [P0] should include correct store assignment data", async () => {
      // GIVEN: Store with specific data
      const mockStore = createMockStore();
      mockPrismaClient.store.findUnique.mockResolvedValue(mockStore);

      const { storeManagerSyncService } =
        await import("../../backend/src/services/api-key/store-manager-sync.service");

      // WHEN: Getting store manager
      const result = await storeManagerSyncService.getStoreManagerForSync(
        mockStore.store_id,
      );

      // THEN: Store assignments contain correct data
      expect(result?.storeAssignments).toHaveLength(1);
      expect(result?.storeAssignments[0].storeId).toBe(mockStore.store_id);
      expect(result?.storeAssignments[0].storeName).toBe(mockStore.name);
      expect(result?.storeAssignments[0].storePublicId).toBe(
        mockStore.public_id,
      );
    });

    it("SMSYNC-U-016: [P1] should return ISO 8601 formatted updatedAt", async () => {
      // GIVEN: Store manager with specific update time
      const mockStore = createMockStore();
      const updateDate = new Date("2024-01-15T12:30:45.000Z");
      mockStore.store_login.updated_at = updateDate;
      mockPrismaClient.store.findUnique.mockResolvedValue(mockStore);

      const { storeManagerSyncService } =
        await import("../../backend/src/services/api-key/store-manager-sync.service");

      // WHEN: Getting store manager
      const result = await storeManagerSyncService.getStoreManagerForSync(
        mockStore.store_id,
      );

      // THEN: updatedAt is ISO 8601 format
      expect(result?.updatedAt).toBe("2024-01-15T12:30:45.000Z");
      expect(result?.updatedAt).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
      );
    });

    it("SMSYNC-U-020: [P0] should include email in response", async () => {
      // GIVEN: Store manager with email
      const mockStore = createMockStore();
      mockPrismaClient.store.findUnique.mockResolvedValue(mockStore);

      const { storeManagerSyncService } =
        await import("../../backend/src/services/api-key/store-manager-sync.service");

      // WHEN: Getting store manager
      const result = await storeManagerSyncService.getStoreManagerForSync(
        mockStore.store_id,
      );

      // THEN: Email is included
      expect(result?.email).toBe("john.smith@teststore.com");
    });

    it("SMSYNC-U-021: [P0] should include publicId in response", async () => {
      // GIVEN: Store manager with public ID
      const mockStore = createMockStore();
      mockPrismaClient.store.findUnique.mockResolvedValue(mockStore);

      const { storeManagerSyncService } =
        await import("../../backend/src/services/api-key/store-manager-sync.service");

      // WHEN: Getting store manager
      const result = await storeManagerSyncService.getStoreManagerForSync(
        mockStore.store_id,
      );

      // THEN: Public ID is included
      expect(result?.publicId).toBe("USR_MGR001");
    });
  });

  // ==========================================================================
  // AUDIT LOGGING TESTS
  // ==========================================================================

  describe("Audit Logging", () => {
    it("SMSYNC-U-018: [P1] should log audit event on activation sync", async () => {
      // GIVEN: Store manager exists
      const mockStore = createMockStore();
      mockPrismaClient.store.findUnique.mockResolvedValue(mockStore);

      const { apiKeyAuditService } =
        await import("../../backend/src/services/api-key/api-key-audit.service");
      const { storeManagerSyncService } =
        await import("../../backend/src/services/api-key/store-manager-sync.service");

      const identity = createMockApiKeyIdentity();
      const auditContext = {
        apiKeyId: identity.apiKeyId,
        ipAddress: "192.168.1.100",
        eventType: "ACTIVATION" as const,
      };

      // WHEN: Getting store manager for activation
      await storeManagerSyncService.getStoreManagerForActivation(
        identity,
        auditContext,
      );

      // Wait for async audit log
      await new Promise((resolve) => setTimeout(resolve, 50));

      // THEN: Audit event is logged
      expect(apiKeyAuditService.logCustomEvent).toHaveBeenCalledWith(
        identity.apiKeyId,
        "ACTIVATED",
        "DEVICE",
        "192.168.1.100",
        undefined,
        expect.objectContaining({
          syncType: "STORE_MANAGER_SYNC",
          managerFound: true,
        }),
      );
    });

    it("should log managerFound: false when no manager configured", async () => {
      // GIVEN: Store has no manager
      const mockStore = createMockStoreWithoutLogin();
      mockPrismaClient.store.findUnique.mockResolvedValue(mockStore);

      const { apiKeyAuditService } =
        await import("../../backend/src/services/api-key/api-key-audit.service");
      const { storeManagerSyncService } =
        await import("../../backend/src/services/api-key/store-manager-sync.service");

      const identity = createMockApiKeyIdentity();
      const auditContext = {
        apiKeyId: identity.apiKeyId,
        ipAddress: "192.168.1.100",
        eventType: "ACTIVATION" as const,
      };

      // WHEN: Getting store manager for activation
      await storeManagerSyncService.getStoreManagerForActivation(
        identity,
        auditContext,
      );

      // Wait for async audit log
      await new Promise((resolve) => setTimeout(resolve, 50));

      // THEN: Audit event logs managerFound: false
      expect(apiKeyAuditService.logCustomEvent).toHaveBeenCalledWith(
        identity.apiKeyId,
        "ACTIVATED",
        "DEVICE",
        "192.168.1.100",
        undefined,
        expect.objectContaining({
          syncType: "STORE_MANAGER_SYNC",
          managerFound: false,
        }),
      );
    });
  });
});
