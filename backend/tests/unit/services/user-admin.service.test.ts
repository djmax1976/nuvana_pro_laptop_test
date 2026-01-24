/**
 * User Admin Service Unit Tests - Structured Company Address Storage
 *
 * Phase 1: Backend Schema & Service Updates
 * Tests the service layer for structured address storage and validation.
 *
 * Test Coverage:
 * - ADDR-SVC-001: Structured fields storage
 * - ADDR-SVC-002: Legacy field population
 * - ADDR-SVC-003: State validation
 * - ADDR-SVC-004: County validation
 * - ADDR-SVC-005: County-state mismatch
 * - ADDR-SVC-006: Transaction rollback
 *
 * Security Compliance:
 * - DB-001 ORM_USAGE: Using Prisma query builder
 * - DB-006 TENANT_ISOLATION: Proper scoping
 * - SEC-006 SQL_INJECTION: Parameterized queries via Prisma
 *
 * @module tests/unit/services/user-admin.service.test
 */

import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { createTestUuid } from "../../utils/prisma-mock";

// =============================================================================
// Mock Setup - Hoisted declarations
// =============================================================================

// Create mock models factory (must be at module scope for hoisting)
const createMockModel = () => ({
  findUnique: vi.fn(),
  findFirst: vi.fn(),
  findMany: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  count: vi.fn(),
  upsert: vi.fn(),
  createMany: vi.fn(),
  updateMany: vi.fn(),
  deleteMany: vi.fn(),
});

// Mock the prisma client - hoisted mock
vi.mock("../../../src/utils/db", () => {
  const createMock = () => ({
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
    upsert: vi.fn(),
    createMany: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
  });
  return {
    prisma: {
      user: createMock(),
      company: createMock(),
      store: createMock(),
      role: createMock(),
      userRole: createMock(),
      auditLog: createMock(),
      uSState: createMock(),
      uSCounty: createMock(),
      $transaction: vi.fn(),
      $connect: vi.fn(),
      $disconnect: vi.fn(),
    },
  };
});

// Mock active-status middleware
vi.mock("../../../src/middleware/active-status.middleware", () => ({
  invalidateUserStatusCache: vi.fn().mockResolvedValue(undefined),
  invalidateMultipleUserStatusCache: vi.fn().mockResolvedValue(undefined),
}));

// Mock public-id generator
vi.mock("../../../src/utils/public-id", () => ({
  generatePublicId: vi.fn().mockReturnValue("USR_test123"),
  PUBLIC_ID_PREFIXES: {
    USER: "USR",
    COMPANY: "CMP",
  },
}));

// Import after mocking
import { UserAdminService } from "../../../src/services/user-admin.service";
import { prisma } from "../../../src/utils/db";
import type { USAddressInput } from "../../../src/schemas/address.schema";

// Get typed reference to mocked prisma
const mockPrisma = prisma as unknown as {
  user: ReturnType<typeof createMockModel>;
  company: ReturnType<typeof createMockModel>;
  store: ReturnType<typeof createMockModel>;
  role: ReturnType<typeof createMockModel>;
  userRole: ReturnType<typeof createMockModel>;
  auditLog: ReturnType<typeof createMockModel>;
  uSState: ReturnType<typeof createMockModel>;
  uSCounty: ReturnType<typeof createMockModel>;
  $transaction: ReturnType<typeof vi.fn>;
};

// =============================================================================
// Test Constants
// =============================================================================

const TEST_GEORGIA_STATE_ID = createTestUuid("state", 1);
const TEST_FLORIDA_STATE_ID = createTestUuid("state", 2);
const TEST_FULTON_COUNTY_ID = createTestUuid("county", 1);
const TEST_COBB_COUNTY_ID = createTestUuid("county", 2);
const TEST_MIAMIDADE_COUNTY_ID = createTestUuid("county", 3); // Florida county
const TEST_CLIENT_OWNER_ROLE_ID = createTestUuid("role", 1);
const TEST_SUPERADMIN_ROLE_ID = createTestUuid("role", 2);
const TEST_USER_ID = createTestUuid("user", 1);
const TEST_COMPANY_ID = createTestUuid("company", 1);

// =============================================================================
// Test Data Factories
// =============================================================================

function createTestGeorgiaState() {
  return {
    state_id: TEST_GEORGIA_STATE_ID,
    code: "GA",
    name: "Georgia",
    is_active: true,
  };
}

function createTestFloridaState() {
  return {
    state_id: TEST_FLORIDA_STATE_ID,
    code: "FL",
    name: "Florida",
    is_active: true,
  };
}

function createTestFultonCounty() {
  return {
    county_id: TEST_FULTON_COUNTY_ID,
    name: "Fulton",
    state_id: TEST_GEORGIA_STATE_ID,
    is_active: true,
  };
}

function createTestCobbCounty() {
  return {
    county_id: TEST_COBB_COUNTY_ID,
    name: "Cobb",
    state_id: TEST_GEORGIA_STATE_ID,
    is_active: true,
  };
}

function createTestMiamiDadeCounty() {
  return {
    county_id: TEST_MIAMIDADE_COUNTY_ID,
    name: "Miami-Dade",
    state_id: TEST_FLORIDA_STATE_ID, // Florida!
    is_active: true,
  };
}

function createTestClientOwnerRole() {
  return {
    role_id: TEST_CLIENT_OWNER_ROLE_ID,
    code: "CLIENT_OWNER",
    description: "Client Owner",
    scope: "COMPANY",
  };
}

function createTestSuperadminRole() {
  return {
    role_id: TEST_SUPERADMIN_ROLE_ID,
    code: "SUPERADMIN",
    description: "Super Administrator",
    scope: "SYSTEM",
  };
}

function createTestAuditContext() {
  return {
    userId: TEST_USER_ID,
    userEmail: "admin@test.com",
    userRoles: ["SUPERADMIN"],
    ipAddress: "127.0.0.1",
    userAgent: "TestAgent/1.0",
  };
}

function createValidStructuredAddress(
  overrides: Partial<USAddressInput> = {}
): USAddressInput {
  return {
    address_line1: "789 Enterprise Blvd",
    address_line2: "Floor 5",
    city: "Marietta",
    state_id: TEST_GEORGIA_STATE_ID,
    county_id: TEST_COBB_COUNTY_ID,
    zip_code: "30060",
    ...overrides,
  };
}

function createValidCreateUserInput(overrides: Record<string, unknown> = {}) {
  return {
    email: "structured-addr@test.com",
    name: "Test Owner",
    password: "TestPass123!",
    roles: [{ role_id: TEST_CLIENT_OWNER_ROLE_ID, scope_type: "COMPANY" as const }],
    companyName: "Structured Address Co",
    companyAddress: createValidStructuredAddress(),
    ...overrides,
  };
}

// =============================================================================
// Test Suite
// =============================================================================

describe("UserAdminService - Structured Company Address Storage", () => {
  let service: UserAdminService;
  let mockTx: ReturnType<typeof createMockModel> & {
    user: ReturnType<typeof createMockModel>;
    company: ReturnType<typeof createMockModel>;
    role: ReturnType<typeof createMockModel>;
    userRole: ReturnType<typeof createMockModel>;
    uSState: ReturnType<typeof createMockModel>;
    uSCounty: ReturnType<typeof createMockModel>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    service = new UserAdminService();

    // Create mock transaction context
    mockTx = {
      user: createMockModel(),
      company: createMockModel(),
      role: createMockModel(),
      userRole: createMockModel(),
      uSState: createMockModel(),
      uSCounty: createMockModel(),
      ...createMockModel(),
    };

    // Default: Set up $transaction to execute the callback with mockTx
    mockPrisma.$transaction.mockImplementation(async (callback: (tx: typeof mockTx) => Promise<unknown>) => {
      return callback(mockTx);
    });
  });

  // ===========================================================================
  // ADDR-SVC-001: Structured fields storage
  // ===========================================================================

  describe("ADDR-SVC-001: Structured fields storage", () => {
    it("[P0] should store company address in structured fields", async () => {
      // Setup mocks - use mockResolvedValueOnce for ordered returns
      // First call: duplicate email check returns null (no duplicate)
      // Second call: getUserById returns user object
      mockPrisma.user.findUnique
        .mockResolvedValueOnce(null) // No duplicate email
        .mockResolvedValueOnce({
          user_id: TEST_USER_ID,
          email: "structured-addr@test.com",
          name: "Test Owner",
          status: "ACTIVE",
          created_at: new Date(),
          updated_at: new Date(),
          user_roles: [{
            user_role_id: createTestUuid("userrole", 1),
            assigned_at: new Date(),
            company_id: TEST_COMPANY_ID,
            store_id: null,
            role: createTestClientOwnerRole(),
            company: { name: "Structured Address Co" },
            store: null,
          }],
        });

      mockPrisma.role.findUnique.mockResolvedValue(createTestClientOwnerRole());

      // Mock state lookup (inside transaction)
      mockTx.uSState.findUnique.mockResolvedValue(createTestGeorgiaState());

      // Mock county lookup (inside transaction)
      mockTx.uSCounty.findUnique.mockResolvedValue(createTestCobbCounty());

      // Mock user creation
      const createdUser = {
        user_id: TEST_USER_ID,
        public_id: "USR_test123",
        email: "structured-addr@test.com",
        name: "Test Owner",
        status: "ACTIVE",
      };
      mockTx.user.create.mockResolvedValue(createdUser);

      // Mock company creation
      const createdCompany = {
        company_id: TEST_COMPANY_ID,
        public_id: "CMP_test123",
        name: "Structured Address Co",
        address: "789 Enterprise Blvd, Floor 5, Marietta, GA 30060",
        address_line1: "789 Enterprise Blvd",
        address_line2: "Floor 5",
        city: "Marietta",
        state_id: TEST_GEORGIA_STATE_ID,
        county_id: TEST_COBB_COUNTY_ID,
        zip_code: "30060",
        status: "ACTIVE",
      };
      mockTx.company.create.mockResolvedValue(createdCompany);

      // Mock role lookup in transaction
      mockTx.role.findUnique.mockResolvedValue(createTestClientOwnerRole());

      // Mock user role creation
      mockTx.userRole.create.mockResolvedValue({
        user_role_id: createTestUuid("userrole", 1),
        user_id: TEST_USER_ID,
        role_id: TEST_CLIENT_OWNER_ROLE_ID,
        company_id: TEST_COMPANY_ID,
      });

      // Mock audit log
      mockPrisma.auditLog.create.mockResolvedValue({});

      // Execute
      const input = createValidCreateUserInput();
      const auditContext = createTestAuditContext();

      await service.createUser(input, auditContext);

      // Verify company.create was called with structured address fields
      expect(mockTx.company.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: "Structured Address Co",
            address_line1: "789 Enterprise Blvd",
            address_line2: "Floor 5",
            city: "Marietta",
            state_id: TEST_GEORGIA_STATE_ID,
            county_id: TEST_COBB_COUNTY_ID,
            zip_code: "30060",
          }),
        })
      );
    });

    it("[P0] should store address with null county_id when not provided", async () => {
      // Setup mocks - ordered returns
      mockPrisma.user.findUnique
        .mockResolvedValueOnce(null) // No duplicate email
        .mockResolvedValueOnce({
          user_id: TEST_USER_ID,
          email: "no-county@test.com",
          name: "Test Owner",
          status: "ACTIVE",
          created_at: new Date(),
          updated_at: new Date(),
          user_roles: [],
        });
      mockPrisma.role.findUnique.mockResolvedValue(createTestClientOwnerRole());
      mockTx.uSState.findUnique.mockResolvedValue(createTestGeorgiaState());
      mockTx.user.create.mockResolvedValue({
        user_id: TEST_USER_ID,
        email: "no-county@test.com",
        name: "Test Owner",
        status: "ACTIVE",
      });
      mockTx.company.create.mockResolvedValue({ company_id: TEST_COMPANY_ID });
      mockTx.role.findUnique.mockResolvedValue(createTestClientOwnerRole());
      mockTx.userRole.create.mockResolvedValue({});
      mockPrisma.auditLog.create.mockResolvedValue({});

      // Execute with address without county_id
      const input = createValidCreateUserInput({
        email: "no-county@test.com",
        companyAddress: createValidStructuredAddress({ county_id: null }),
      });
      const auditContext = createTestAuditContext();

      await service.createUser(input, auditContext);

      // Verify company.create was called with null county_id
      expect(mockTx.company.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            county_id: null,
          }),
        })
      );
    });
  });

  // ===========================================================================
  // ADDR-SVC-002: Legacy field population
  // ===========================================================================

  describe("ADDR-SVC-002: Legacy field population", () => {
    it("[P0] should populate legacy address field for backward compatibility", async () => {
      // Setup mocks - ordered returns
      mockPrisma.user.findUnique
        .mockResolvedValueOnce(null) // No duplicate email
        .mockResolvedValueOnce({
          user_id: TEST_USER_ID,
          email: "legacy-test@test.com",
          name: "Test Owner",
          status: "ACTIVE",
          created_at: new Date(),
          updated_at: new Date(),
          user_roles: [],
        });
      mockPrisma.role.findUnique.mockResolvedValue(createTestClientOwnerRole());
      mockTx.uSState.findUnique.mockResolvedValue(createTestGeorgiaState());
      mockTx.uSCounty.findUnique.mockResolvedValue(createTestCobbCounty());
      mockTx.user.create.mockResolvedValue({
        user_id: TEST_USER_ID,
        email: "legacy-test@test.com",
        name: "Test Owner",
        status: "ACTIVE",
      });
      mockTx.company.create.mockResolvedValue({ company_id: TEST_COMPANY_ID });
      mockTx.role.findUnique.mockResolvedValue(createTestClientOwnerRole());
      mockTx.userRole.create.mockResolvedValue({});
      mockPrisma.auditLog.create.mockResolvedValue({});

      // Execute
      const input = createValidCreateUserInput({ email: "legacy-test@test.com" });
      const auditContext = createTestAuditContext();

      await service.createUser(input, auditContext);

      // Verify legacy address field is populated with formatted string
      expect(mockTx.company.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            // Legacy field should contain formatted address string
            address: expect.stringContaining("789 Enterprise Blvd"),
          }),
        })
      );

      // Also verify the address contains city and state code
      const createCall = mockTx.company.create.mock.calls[0][0];
      expect(createCall.data.address).toContain("Marietta");
      expect(createCall.data.address).toContain("GA");
      expect(createCall.data.address).toContain("30060");
    });

    it("[P0] should format address with optional address_line2", async () => {
      // Setup mocks - ordered returns
      mockPrisma.user.findUnique
        .mockResolvedValueOnce(null) // No duplicate email
        .mockResolvedValueOnce({
          user_id: TEST_USER_ID,
          email: "no-line2@test.com",
          name: "Test Owner",
          status: "ACTIVE",
          created_at: new Date(),
          updated_at: new Date(),
          user_roles: [],
        });
      mockPrisma.role.findUnique.mockResolvedValue(createTestClientOwnerRole());
      mockTx.uSState.findUnique.mockResolvedValue(createTestGeorgiaState());
      mockTx.user.create.mockResolvedValue({
        user_id: TEST_USER_ID,
        email: "no-line2@test.com",
        name: "Test Owner",
        status: "ACTIVE",
      });
      mockTx.company.create.mockResolvedValue({ company_id: TEST_COMPANY_ID });
      mockTx.role.findUnique.mockResolvedValue(createTestClientOwnerRole());
      mockTx.userRole.create.mockResolvedValue({});
      mockPrisma.auditLog.create.mockResolvedValue({});

      // Execute without address_line2
      const input = createValidCreateUserInput({
        email: "no-line2@test.com",
        companyAddress: createValidStructuredAddress({
          address_line2: undefined,
          county_id: undefined,
        }),
      });
      const auditContext = createTestAuditContext();

      await service.createUser(input, auditContext);

      // Verify legacy address doesn't contain "undefined" or "null"
      const createCall = mockTx.company.create.mock.calls[0][0];
      expect(createCall.data.address).not.toContain("undefined");
      expect(createCall.data.address).not.toContain("null");
    });
  });

  // ===========================================================================
  // ADDR-SVC-003: State validation
  // ===========================================================================

  describe("ADDR-SVC-003: State validation", () => {
    it("[P0] should reject non-existent state_id", async () => {
      // Setup mocks
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.role.findUnique.mockResolvedValue(createTestClientOwnerRole());
      mockTx.user.create.mockResolvedValue({
        user_id: TEST_USER_ID,
        email: "bad-state@test.com",
        name: "Test Owner",
        status: "ACTIVE",
      });

      // Mock state lookup to return null (not found)
      mockTx.uSState.findUnique.mockResolvedValue(null);

      // Execute with non-existent state_id
      const input = createValidCreateUserInput({
        email: "bad-state@test.com",
        companyAddress: createValidStructuredAddress({
          state_id: "00000000-0000-0000-0000-000000000000",
        }),
      });
      const auditContext = createTestAuditContext();

      // Verify it throws error
      await expect(service.createUser(input, auditContext))
        .rejects.toThrow(/state.*not found/i);
    });

    it("[P0] should reject inactive state", async () => {
      // Setup mocks
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.role.findUnique.mockResolvedValue(createTestClientOwnerRole());
      mockTx.user.create.mockResolvedValue({
        user_id: TEST_USER_ID,
        email: "inactive-state@test.com",
        name: "Test Owner",
        status: "ACTIVE",
      });

      // Mock state lookup to return inactive state
      mockTx.uSState.findUnique.mockResolvedValue({
        ...createTestGeorgiaState(),
        is_active: false,
      });

      // Execute
      const input = createValidCreateUserInput({
        email: "inactive-state@test.com",
      });
      const auditContext = createTestAuditContext();

      // Verify it throws error
      await expect(service.createUser(input, auditContext))
        .rejects.toThrow(/not active/i);
    });
  });

  // ===========================================================================
  // ADDR-SVC-004: County validation
  // ===========================================================================

  describe("ADDR-SVC-004: County validation", () => {
    it("[P0] should reject non-existent county_id", async () => {
      // Setup mocks
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.role.findUnique.mockResolvedValue(createTestClientOwnerRole());
      mockTx.user.create.mockResolvedValue({
        user_id: TEST_USER_ID,
        email: "bad-county@test.com",
        name: "Test Owner",
        status: "ACTIVE",
      });

      // Mock state lookup to succeed
      mockTx.uSState.findUnique.mockResolvedValue(createTestGeorgiaState());

      // Mock county lookup to return null (not found)
      mockTx.uSCounty.findUnique.mockResolvedValue(null);

      // Execute with non-existent county_id
      const input = createValidCreateUserInput({
        email: "bad-county@test.com",
        companyAddress: createValidStructuredAddress({
          county_id: "00000000-0000-0000-0000-000000000001",
        }),
      });
      const auditContext = createTestAuditContext();

      // Verify it throws error
      await expect(service.createUser(input, auditContext))
        .rejects.toThrow(/county.*not found/i);
    });

    it("[P0] should reject inactive county", async () => {
      // Setup mocks
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.role.findUnique.mockResolvedValue(createTestClientOwnerRole());
      mockTx.user.create.mockResolvedValue({
        user_id: TEST_USER_ID,
        email: "inactive-county@test.com",
        name: "Test Owner",
        status: "ACTIVE",
      });
      mockTx.uSState.findUnique.mockResolvedValue(createTestGeorgiaState());

      // Mock county lookup to return inactive county
      mockTx.uSCounty.findUnique.mockResolvedValue({
        ...createTestCobbCounty(),
        is_active: false,
      });

      // Execute
      const input = createValidCreateUserInput({
        email: "inactive-county@test.com",
      });
      const auditContext = createTestAuditContext();

      // Verify it throws error
      await expect(service.createUser(input, auditContext))
        .rejects.toThrow(/not active/i);
    });
  });

  // ===========================================================================
  // ADDR-SVC-005: County-state mismatch
  // ===========================================================================

  describe("ADDR-SVC-005: County-state mismatch", () => {
    it("[P0] should reject county_id not belonging to state_id", async () => {
      // Setup mocks
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.role.findUnique.mockResolvedValue(createTestClientOwnerRole());
      mockTx.user.create.mockResolvedValue({
        user_id: TEST_USER_ID,
        email: "mismatch@test.com",
        name: "Test Owner",
        status: "ACTIVE",
      });

      // Mock Georgia state lookup
      mockTx.uSState.findUnique.mockResolvedValue(createTestGeorgiaState());

      // Mock Miami-Dade county (belongs to Florida, not Georgia!)
      mockTx.uSCounty.findUnique.mockResolvedValue(createTestMiamiDadeCounty());

      // Execute with Georgia state but Miami-Dade county (Florida)
      const input = createValidCreateUserInput({
        email: "mismatch@test.com",
        companyAddress: createValidStructuredAddress({
          state_id: TEST_GEORGIA_STATE_ID,
          county_id: TEST_MIAMIDADE_COUNTY_ID, // Florida county!
        }),
      });
      const auditContext = createTestAuditContext();

      // Verify it throws error about county not belonging to state
      await expect(service.createUser(input, auditContext))
        .rejects.toThrow(/does not belong/i);
    });
  });

  // ===========================================================================
  // ADDR-SVC-006: Transaction rollback
  // ===========================================================================

  describe("ADDR-SVC-006: Transaction rollback", () => {
    it("[P1] should rollback user creation if address validation fails", async () => {
      // Setup mocks
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.role.findUnique.mockResolvedValue(createTestClientOwnerRole());

      // User creation succeeds
      mockTx.user.create.mockResolvedValue({
        user_id: TEST_USER_ID,
        email: "rollback-test@test.com",
        name: "Test Owner",
        status: "ACTIVE",
      });

      // State validation fails (state not found)
      mockTx.uSState.findUnique.mockResolvedValue(null);

      // Execute
      const input = createValidCreateUserInput({
        email: "rollback-test@test.com",
      });
      const auditContext = createTestAuditContext();

      // Verify it throws error
      await expect(service.createUser(input, auditContext))
        .rejects.toThrow(/state.*not found/i);

      // Verify company was never created (transaction should have rolled back)
      // Since we're using $transaction, a thrown error will rollback everything
      expect(mockTx.company.create).not.toHaveBeenCalled();
    });

    it("[P1] should rollback if county-state validation fails after user created", async () => {
      // Setup mocks
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.role.findUnique.mockResolvedValue(createTestClientOwnerRole());

      // User creation succeeds
      mockTx.user.create.mockResolvedValue({
        user_id: TEST_USER_ID,
        email: "rollback-county@test.com",
        name: "Test Owner",
        status: "ACTIVE",
      });

      // State validation succeeds
      mockTx.uSState.findUnique.mockResolvedValue(createTestGeorgiaState());

      // County validation fails (county doesn't belong to state)
      mockTx.uSCounty.findUnique.mockResolvedValue(createTestMiamiDadeCounty());

      // Execute
      const input = createValidCreateUserInput({
        email: "rollback-county@test.com",
        companyAddress: createValidStructuredAddress({
          county_id: TEST_MIAMIDADE_COUNTY_ID,
        }),
      });
      const auditContext = createTestAuditContext();

      // Verify it throws error
      await expect(service.createUser(input, auditContext))
        .rejects.toThrow(/does not belong/i);

      // Company should not have been created
      expect(mockTx.company.create).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Input Validation
  // ===========================================================================

  describe("Input Validation - Structured Address Fields", () => {
    it("[P0] should reject missing address_line1", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.role.findUnique.mockResolvedValue(createTestClientOwnerRole());

      const input = createValidCreateUserInput({
        companyAddress: {
          // address_line1: MISSING
          city: "Atlanta",
          state_id: TEST_GEORGIA_STATE_ID,
          zip_code: "30301",
        } as USAddressInput,
      });
      const auditContext = createTestAuditContext();

      await expect(service.createUser(input, auditContext))
        .rejects.toThrow(/address_line1.*required/i);
    });

    it("[P0] should reject missing city", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.role.findUnique.mockResolvedValue(createTestClientOwnerRole());

      const input = createValidCreateUserInput({
        companyAddress: {
          address_line1: "123 Main St",
          // city: MISSING
          state_id: TEST_GEORGIA_STATE_ID,
          zip_code: "30301",
        } as USAddressInput,
      });
      const auditContext = createTestAuditContext();

      await expect(service.createUser(input, auditContext))
        .rejects.toThrow(/city.*required/i);
    });

    it("[P0] should reject missing state_id", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.role.findUnique.mockResolvedValue(createTestClientOwnerRole());

      const input = createValidCreateUserInput({
        companyAddress: {
          address_line1: "123 Main St",
          city: "Atlanta",
          // state_id: MISSING
          zip_code: "30301",
        } as USAddressInput,
      });
      const auditContext = createTestAuditContext();

      await expect(service.createUser(input, auditContext))
        .rejects.toThrow(/state.*required/i);
    });

    it("[P0] should reject missing zip_code", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.role.findUnique.mockResolvedValue(createTestClientOwnerRole());

      const input = createValidCreateUserInput({
        companyAddress: {
          address_line1: "123 Main St",
          city: "Atlanta",
          state_id: TEST_GEORGIA_STATE_ID,
          // zip_code: MISSING
        } as USAddressInput,
      });
      const auditContext = createTestAuditContext();

      await expect(service.createUser(input, auditContext))
        .rejects.toThrow(/zip.*required/i);
    });
  });
});
