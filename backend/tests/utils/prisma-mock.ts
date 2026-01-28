/**
 * Prisma Mock Utilities
 *
 * Enterprise-grade mocking utilities for Prisma Client.
 * Provides type-safe mocks that match actual Prisma behavior.
 *
 * @module tests/utils/prisma-mock
 */

import { vi } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import type { PrismaClient, Prisma } from "@prisma/client";

// =============================================================================
// Mock Factory Types
// =============================================================================

type MockPrismaModel = {
  findUnique: ReturnType<typeof vi.fn>;
  findFirst: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  count: ReturnType<typeof vi.fn>;
  upsert: ReturnType<typeof vi.fn>;
  createMany: ReturnType<typeof vi.fn>;
  updateMany: ReturnType<typeof vi.fn>;
  deleteMany: ReturnType<typeof vi.fn>;
};

// =============================================================================
// Mock Prisma Client Factory
// =============================================================================

/**
 * Creates a fully mocked Prisma client for unit testing.
 * All methods return vi.fn() mocks that can be configured per test.
 */
export function createMockPrismaClient() {
  const createMockModel = (): MockPrismaModel => ({
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
    // Core lottery models
    lotteryGame: createMockModel(),
    lotteryBin: createMockModel(),
    lotteryPack: createMockModel(),
    lotteryPayoutConfig: createMockModel(),
    lotteryBusinessDay: createMockModel(),
    lotteryDayPack: createMockModel(),
    lotteryShiftOpening: createMockModel(),
    lotteryShiftClosing: createMockModel(),
    lotteryVariance: createMockModel(),
    lotteryPackBinHistory: createMockModel(),

    // Supporting models
    apiKey: createMockModel(),
    apiKeySyncSession: createMockModel(),
    apiKeyAuditLog: createMockModel(),
    store: createMockModel(),
    shift: createMockModel(),
    employee: createMockModel(),
    user: createMockModel(),
    userRole: createMockModel(),
    cashier: createMockModel(),
    pOSTerminal: createMockModel(),
    daySummary: createMockModel(),

    // Transaction support
    $transaction: vi.fn((callback) => {
      if (typeof callback === "function") {
        return callback({
          lotteryGame: createMockModel(),
          lotteryPack: createMockModel(),
          lotteryBusinessDay: createMockModel(),
          lotteryDayPack: createMockModel(),
          lotteryVariance: createMockModel(),
        });
      }
      return Promise.resolve(callback);
    }),

    $connect: vi.fn(),
    $disconnect: vi.fn(),
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn(),
  };
}

// =============================================================================
// Test Data Factories
// =============================================================================

/**
 * Creates realistic test UUIDs with consistent format
 */
export function createTestUuid(prefix: string, index: number = 1): string {
  const paddedIndex = index.toString().padStart(4, "0");
  return `${prefix}-0000-0000-0000-${paddedIndex.repeat(3).slice(0, 12)}`;
}

/**
 * Factory for creating test store data
 */
export function createTestStore(
  overrides: Partial<{
    store_id: string;
    name: string;
    state_id: string;
    is_active: boolean;
  }> = {},
) {
  return {
    store_id: overrides.store_id || createTestUuid("store", 1),
    name: overrides.name || "Test Store",
    state_id: overrides.state_id || createTestUuid("state", 1),
    is_active: overrides.is_active ?? true,
    created_at: new Date("2024-01-01T00:00:00Z"),
    updated_at: new Date("2024-01-01T00:00:00Z"),
  };
}

/**
 * Factory for creating test API key data
 */
export function createTestApiKey(
  overrides: Partial<{
    api_key_id: string;
    store_id: string;
    hashed_key: string;
    status: string;
    description: string;
  }> = {},
) {
  return {
    api_key_id: overrides.api_key_id || createTestUuid("apikey", 1),
    store_id: overrides.store_id || createTestUuid("store", 1),
    hashed_key: overrides.hashed_key || "test-hashed-key",
    status: overrides.status || "ACTIVE",
    description: overrides.description || "Test API Key",
    created_at: new Date("2024-01-01T00:00:00Z"),
    updated_at: new Date("2024-01-01T00:00:00Z"),
    last_used_at: null,
    expires_at: null,
    revoked_at: null,
    revoked_by: null,
  };
}

/**
 * Factory for creating test sync session data
 */
export function createTestSyncSession(
  overrides: Partial<{
    sync_session_id: string;
    api_key_id: string;
    expires_at: Date;
    session_started_at: Date;
    sync_status: string;
    store_id: string;
    state_id: string | null;
  }> = {},
) {
  const now = new Date();
  return {
    sync_session_id: overrides.sync_session_id || createTestUuid("session", 1),
    api_key_id: overrides.api_key_id || createTestUuid("apikey", 1),
    session_started_at: overrides.session_started_at || now,
    expires_at: overrides.expires_at || new Date(now.getTime() + 3600000), // 1 hour
    last_activity_at: now,
    sync_type: "FULL",
    sync_status: overrides.sync_status || "ACTIVE",
    is_active: true,
    api_key: {
      store_id: overrides.store_id || createTestUuid("store", 1),
      store: {
        state_id:
          overrides.state_id !== undefined
            ? overrides.state_id
            : createTestUuid("state", 1),
      },
    },
  };
}

/**
 * Factory for creating test lottery game data
 *
 * Supports both legacy is_active boolean and new status enum field.
 * The status enum values are: ACTIVE, INACTIVE, DISCONTINUED
 */
export function createTestLotteryGame(
  overrides: Partial<{
    game_id: string;
    store_id: string;
    state_id: string | null;
    game_code: string;
    name: string;
    price: string | number;
    pack_value: string | number;
    tickets_per_pack: number;
    is_active: boolean;
    status: "ACTIVE" | "INACTIVE" | "DISCONTINUED";
    updated_at: Date;
  }> = {},
) {
  return {
    game_id: overrides.game_id || createTestUuid("game", 1),
    store_id: overrides.store_id || createTestUuid("store", 1),
    state_id: overrides.state_id ?? null,
    game_code: overrides.game_code || "0001",
    name: overrides.name || "Test Scratch Game",
    price: new Decimal(overrides.price?.toString() || "5.00"),
    pack_value: new Decimal(overrides.pack_value?.toString() || "300.00"),
    tickets_per_pack: overrides.tickets_per_pack || 60,
    is_active: overrides.is_active ?? true,
    // Game lifecycle status enum (ACTIVE, INACTIVE, DISCONTINUED)
    status: overrides.status || "ACTIVE",
    display_order: 1,
    created_at: new Date("2024-01-01T00:00:00Z"),
    updated_at: overrides.updated_at || new Date("2024-01-01T00:00:00Z"),
  };
}

/**
 * Factory for creating test lottery bin data
 */
export function createTestLotteryBin(
  overrides: Partial<{
    bin_id: string;
    store_id: string;
    name: string;
    location: string;
    display_order: number;
    is_active: boolean;
  }> = {},
) {
  return {
    bin_id: overrides.bin_id || createTestUuid("bin", 1),
    store_id: overrides.store_id || createTestUuid("store", 1),
    name: overrides.name || "Bin 1",
    location: overrides.location || "Counter Left",
    display_order: overrides.display_order || 1,
    is_active: overrides.is_active ?? true,
    created_at: new Date("2024-01-01T00:00:00Z"),
    updated_at: new Date("2024-01-01T00:00:00Z"),
  };
}

/**
 * Factory for creating test lottery pack data
 */
export function createTestLotteryPack(
  overrides: Partial<{
    pack_id: string;
    store_id: string;
    game_id: string;
    pack_number: string;
    serial_start: string;
    serial_end: string;
    status: "RECEIVED" | "ACTIVE" | "DEPLETED" | "RETURNED";
    current_bin_id: string | null;
    tickets_sold_count: number;
    received_at: Date;
    activated_at: Date | null;
    depleted_at: Date | null;
    returned_at: Date | null;
  }> = {},
) {
  const storeId = overrides.store_id || createTestUuid("store", 1);
  const gameId = overrides.game_id || createTestUuid("game", 1);

  return {
    pack_id: overrides.pack_id || createTestUuid("pack", 1),
    store_id: storeId,
    game_id: gameId,
    pack_number: overrides.pack_number || "001",
    serial_start: overrides.serial_start || "000000001",
    serial_end: overrides.serial_end || "000000060",
    status: overrides.status || "RECEIVED",
    current_bin_id: overrides.current_bin_id || null,
    tickets_sold_count: overrides.tickets_sold_count || 0,
    last_sold_at: null,
    last_sold_serial: null,
    received_at: overrides.received_at || new Date("2024-01-01T00:00:00Z"),
    received_by: createTestUuid("apikey", 1),
    activated_at: overrides.activated_at || null,
    activated_by: null,
    activated_shift_id: null,
    depleted_at: overrides.depleted_at || null,
    depleted_by: null,
    depleted_shift_id: null,
    depletion_reason: null,
    returned_at: overrides.returned_at || null,
    returned_by: null,
    returned_shift_id: null,
    returned_day_id: null,
    return_reason: null,
    return_notes: null,
    tickets_sold_on_return: null,
    return_sales_amount: null,
    serial_override_approved_by: null,
    serial_override_reason: null,
    mark_sold_approved_by: null,
    mark_sold_approved_at: null,
    mark_sold_reason: null,
    created_at: new Date("2024-01-01T00:00:00Z"),
    updated_at: new Date("2024-01-01T00:00:00Z"),
    // Include relations for mapPackToSyncRecord
    game: {
      game_code: "0001",
      name: "Test Scratch Game",
      price: new Decimal("5.00"),
      pack_value: new Decimal("300.00"),
    },
    bin: null,
  };
}

/**
 * Factory for creating test lottery business day data
 */
export function createTestLotteryBusinessDay(
  overrides: Partial<{
    day_id: string;
    store_id: string;
    business_date: Date;
    status: "OPEN" | "PENDING_CLOSE" | "CLOSED";
    opened_by: string;
  }> = {},
) {
  return {
    day_id: overrides.day_id || createTestUuid("day", 1),
    store_id: overrides.store_id || createTestUuid("store", 1),
    business_date: overrides.business_date || new Date("2024-01-15T00:00:00Z"),
    status: overrides.status || "OPEN",
    opened_at: new Date("2024-01-15T08:00:00Z"),
    opened_by: overrides.opened_by || createTestUuid("employee", 1),
    closed_at: null,
    closed_by: null,
    notes: null,
    pending_close_data: null,
    pending_close_by: null,
    pending_close_at: null,
    pending_close_expires_at: null,
    created_at: new Date("2024-01-15T08:00:00Z"),
    updated_at: new Date("2024-01-15T08:00:00Z"),
  };
}

/**
 * Factory for creating test shift data
 * Matches the Prisma Shift model for lottery sync testing
 */
export function createTestShift(
  overrides: Partial<{
    shift_id: string;
    store_id: string;
    opened_by: string;
    cashier_id: string;
    pos_terminal_id: string | null;
    opened_at: Date;
    closed_at: Date | null;
    opening_cash: string;
    closing_cash: string | null;
    expected_cash: string | null;
    variance: string | null;
    variance_reason: string | null;
    status: string;
    shift_number: number | null;
    approved_by: string | null;
    approved_at: Date | null;
    day_summary_id: string | null;
    external_shift_id: string | null;
    synced_at: Date | null;
  }> = {},
) {
  return {
    shift_id: overrides.shift_id || createTestUuid("shift", 1),
    store_id: overrides.store_id || createTestUuid("store", 1),
    opened_by: overrides.opened_by || createTestUuid("user", 1),
    cashier_id: overrides.cashier_id || createTestUuid("cashier", 1),
    pos_terminal_id: overrides.pos_terminal_id ?? null,
    opened_at: overrides.opened_at || new Date("2024-01-15T08:00:00Z"),
    closed_at: overrides.closed_at ?? null,
    opening_cash: new Decimal(overrides.opening_cash || "100.00"),
    closing_cash: overrides.closing_cash
      ? new Decimal(overrides.closing_cash)
      : null,
    expected_cash: overrides.expected_cash
      ? new Decimal(overrides.expected_cash)
      : null,
    variance: overrides.variance ? new Decimal(overrides.variance) : null,
    variance_reason: overrides.variance_reason ?? null,
    status: overrides.status || "OPEN",
    shift_number: overrides.shift_number ?? null,
    approved_by: overrides.approved_by ?? null,
    approved_at: overrides.approved_at ?? null,
    day_summary_id: overrides.day_summary_id ?? null,
    external_shift_id: overrides.external_shift_id ?? null,
    synced_at: overrides.synced_at ?? null,
    created_at: new Date("2024-01-15T08:00:00Z"),
    updated_at: new Date("2024-01-15T08:00:00Z"),
  };
}

/**
 * Factory for creating test user data
 * For validating user existence in shift sync operations
 */
export function createTestUser(
  overrides: Partial<{
    user_id: string;
    email: string;
    name: string;
    status: string;
    is_client_user: boolean;
  }> = {},
) {
  return {
    user_id: overrides.user_id || createTestUuid("user", 1),
    email: overrides.email || "testuser@example.com",
    name: overrides.name || "Test User",
    status: overrides.status || "ACTIVE",
    is_client_user: overrides.is_client_user ?? false,
    created_at: new Date("2024-01-01T00:00:00Z"),
    updated_at: new Date("2024-01-01T00:00:00Z"),
  };
}

/**
 * Factory for creating test user role data
 * For tenant isolation validation (user access to store)
 */
export function createTestUserRole(
  overrides: Partial<{
    user_role_id: string;
    user_id: string;
    role_id: string;
    store_id: string;
  }> = {},
) {
  return {
    user_role_id: overrides.user_role_id || createTestUuid("userrole", 1),
    user_id: overrides.user_id || createTestUuid("user", 1),
    role_id: overrides.role_id || createTestUuid("role", 1),
    store_id: overrides.store_id || createTestUuid("store", 1),
    assigned_at: new Date("2024-01-01T00:00:00Z"),
    assigned_by: createTestUuid("user", 2),
  };
}

/**
 * Factory for creating test cashier data
 * For validating cashier existence in shift sync operations
 */
export function createTestCashier(
  overrides: Partial<{
    cashier_id: string;
    store_id: string;
    employee_id: string;
    name: string;
    is_active: boolean;
  }> = {},
) {
  return {
    cashier_id: overrides.cashier_id || createTestUuid("cashier", 1),
    store_id: overrides.store_id || createTestUuid("store", 1),
    employee_id: overrides.employee_id || "0001",
    name: overrides.name || "Test Cashier",
    pin_hash: "$2b$10$abcdefghijklmnopqrstuvwxyz",
    is_active: overrides.is_active ?? true,
    hired_on: new Date("2024-01-01T00:00:00Z"),
    created_at: new Date("2024-01-01T00:00:00Z"),
    updated_at: new Date("2024-01-01T00:00:00Z"),
    created_by: createTestUuid("user", 1),
  };
}

/**
 * Factory for creating test POS terminal data
 * For validating terminal existence in shift sync operations
 */
export function createTestPOSTerminal(
  overrides: Partial<{
    pos_terminal_id: string;
    store_id: string;
    name: string;
    terminal_status: string;
    deleted_at: Date | null;
  }> = {},
) {
  return {
    pos_terminal_id: overrides.pos_terminal_id || createTestUuid("terminal", 1),
    store_id: overrides.store_id || createTestUuid("store", 1),
    name: overrides.name || "Terminal 1",
    device_id: "test-device-001",
    connection_type: "MANUAL",
    pos_type: "MANUAL_ENTRY",
    terminal_status: overrides.terminal_status || "ACTIVE",
    deleted_at: overrides.deleted_at ?? null,
    created_at: new Date("2024-01-01T00:00:00Z"),
    updated_at: new Date("2024-01-01T00:00:00Z"),
  };
}

/**
 * Factory for creating test day summary data
 * For linking shifts to business days
 */
export function createTestDaySummary(
  overrides: Partial<{
    day_summary_id: string;
    store_id: string;
    business_date: Date;
    status: string;
  }> = {},
) {
  return {
    day_summary_id: overrides.day_summary_id || createTestUuid("daysummary", 1),
    store_id: overrides.store_id || createTestUuid("store", 1),
    business_date: overrides.business_date || new Date("2024-01-15T00:00:00Z"),
    status: overrides.status || "OPEN",
    opened_at: new Date("2024-01-15T06:00:00Z"),
    closed_at: null,
    created_at: new Date("2024-01-15T06:00:00Z"),
    updated_at: new Date("2024-01-15T06:00:00Z"),
  };
}

/**
 * Factory for creating test variance data
 */
export function createTestLotteryVariance(
  overrides: Partial<{
    variance_id: string;
    pack_id: string;
    shift_id: string;
    variance_type: string;
    expected_serial: string;
    actual_serial: string;
    ticket_difference: number;
    is_resolved: boolean;
    approved_by: string | null;
  }> = {},
) {
  return {
    variance_id: overrides.variance_id || createTestUuid("variance", 1),
    pack_id: overrides.pack_id || createTestUuid("pack", 1),
    shift_id: overrides.shift_id || createTestUuid("shift", 1),
    variance_type: overrides.variance_type || "SERIAL_MISMATCH",
    expected_serial: overrides.expected_serial || "000000030",
    actual_serial: overrides.actual_serial || "000000035",
    ticket_difference: overrides.ticket_difference || 5,
    is_resolved: overrides.is_resolved ?? false,
    approved_by: overrides.approved_by ?? null,
    approved_at: null,
    resolved_by: null,
    resolved_at: null,
    resolution_notes: null,
    reason: null,
    created_at: new Date("2024-01-15T16:00:00Z"),
    updated_at: new Date("2024-01-15T16:00:00Z"),
  };
}

/**
 * Factory for creating API key identity context
 */
export function createTestApiKeyIdentity(
  overrides: Partial<{
    apiKeyId: string;
    storeId: string;
    keyPrefix: string;
  }> = {},
) {
  return {
    apiKeyId: overrides.apiKeyId || createTestUuid("apikey", 1),
    storeId: overrides.storeId || createTestUuid("store", 1),
    keyPrefix: overrides.keyPrefix || "nvn_test",
  };
}

/**
 * Factory for creating audit context
 */
export function createTestAuditContext(
  overrides: Partial<{
    apiKeyId: string;
    sessionId: string;
    ipAddress: string;
    deviceFingerprint: string;
  }> = {},
) {
  return {
    apiKeyId: overrides.apiKeyId || createTestUuid("apikey", 1),
    sessionId: overrides.sessionId || createTestUuid("session", 1),
    ipAddress: overrides.ipAddress || "127.0.0.1",
    deviceFingerprint: overrides.deviceFingerprint || "test-device-fingerprint",
  };
}

// =============================================================================
// Assertion Helpers
// =============================================================================

/**
 * Asserts that a Prisma query was called with proper tenant isolation
 */
export function assertTenantIsolation(
  mockFn: ReturnType<typeof vi.fn>,
  expectedStoreId: string,
) {
  const calls = mockFn.mock.calls;
  if (calls.length === 0) {
    throw new Error("Expected mock to be called, but it was not");
  }

  const lastCall = calls[calls.length - 1][0];
  const whereClause = lastCall?.where;

  if (!whereClause?.store_id) {
    throw new Error(
      `Expected query to have store_id in where clause for tenant isolation. Got: ${JSON.stringify(whereClause)}`,
    );
  }

  if (whereClause.store_id !== expectedStoreId) {
    throw new Error(
      `Expected store_id ${expectedStoreId}, got ${whereClause.store_id}`,
    );
  }
}

/**
 * Asserts that all queries in a test used parameterized inputs (not raw SQL)
 */
export function assertNoRawSqlInjection(
  mockPrisma: ReturnType<typeof createMockPrismaClient>,
) {
  const rawCalls = mockPrisma.$queryRaw.mock.calls.length;
  const executeRawCalls = mockPrisma.$executeRaw.mock.calls.length;

  if (rawCalls > 0 || executeRawCalls > 0) {
    throw new Error(
      `Found ${rawCalls + executeRawCalls} raw SQL calls. Use Prisma query builders for parameterized queries.`,
    );
  }
}

// =============================================================================
// Export Types
// =============================================================================

export type MockPrismaClient = ReturnType<typeof createMockPrismaClient>;
