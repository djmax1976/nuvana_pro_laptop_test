/**
 * User Creation Schema Unit Tests - Structured Company Address Validation
 *
 * Phase 1: Backend Schema & Service Updates
 * Tests the Zod schema validation for structured company addresses.
 *
 * Test Coverage:
 * - ADDR-SCHEMA-001: Valid structured address acceptance
 * - ADDR-SCHEMA-002: Required field validation
 * - ADDR-SCHEMA-003: UUID format validation
 * - ADDR-SCHEMA-004: 5-digit ZIP code format validation
 * - ADDR-SCHEMA-005: ZIP+4 format validation
 * - ADDR-SCHEMA-006: ZIP code rejection for invalid formats
 * - ADDR-SCHEMA-007: Address line length validation
 * - ADDR-SCHEMA-008: City length validation
 *
 * @module tests/unit/schemas/user-creation.schema.test
 */

import { describe, it, expect } from "vitest";
import { createUserSchema } from "../../../src/schemas/user.schema";
import { USAddressSchema } from "../../../src/schemas/address.schema";

// =============================================================================
// Test Constants
// =============================================================================

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";
const VALID_STATE_ID = "550e8400-e29b-41d4-a716-446655440001";
const VALID_COUNTY_ID = "660e8400-e29b-41d4-a716-446655440001";
const VALID_ROLE_ID = "770e8400-e29b-41d4-a716-446655440001";

// =============================================================================
// Helper Functions
// =============================================================================

function createValidUserInput(overrides: Record<string, unknown> = {}) {
  return {
    email: "client@test.com",
    name: "Test Client Owner",
    password: "StrongPass123!",
    roles: [{ role_id: VALID_ROLE_ID, scope_type: "COMPANY" as const }],
    companyName: "Test Company",
    companyAddress: {
      address_line1: "123 Main Street",
      address_line2: "Suite 100",
      city: "Atlanta",
      state_id: VALID_STATE_ID,
      county_id: VALID_COUNTY_ID,
      zip_code: "30301",
    },
    ...overrides,
  };
}

function createValidStructuredAddress(overrides: Record<string, unknown> = {}) {
  return {
    address_line1: "123 Main Street",
    address_line2: "Suite 100",
    city: "Atlanta",
    state_id: VALID_STATE_ID,
    county_id: VALID_COUNTY_ID,
    zip_code: "30301",
    ...overrides,
  };
}

// =============================================================================
// USAddressSchema Tests
// =============================================================================

describe("USAddressSchema - Structured Address Validation", () => {
  // ADDR-SCHEMA-001: Valid structured address acceptance
  it("[P0] should accept valid structured address with all fields", () => {
    const validAddress = createValidStructuredAddress();
    const result = USAddressSchema.safeParse(validAddress);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.address_line1).toBe("123 Main Street");
      expect(result.data.address_line2).toBe("Suite 100");
      expect(result.data.city).toBe("Atlanta");
      expect(result.data.state_id).toBe(VALID_STATE_ID);
      expect(result.data.county_id).toBe(VALID_COUNTY_ID);
      expect(result.data.zip_code).toBe("30301");
    }
  });

  it("[P0] should accept address without optional address_line2", () => {
    const address = createValidStructuredAddress({ address_line2: undefined });
    const result = USAddressSchema.safeParse(address);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.address_line2).toBeUndefined();
    }
  });

  it("[P0] should accept address with null address_line2", () => {
    const address = createValidStructuredAddress({ address_line2: null });
    const result = USAddressSchema.safeParse(address);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.address_line2).toBeNull();
    }
  });

  it("[P0] should accept address with null county_id", () => {
    const address = createValidStructuredAddress({ county_id: null });
    const result = USAddressSchema.safeParse(address);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.county_id).toBeNull();
    }
  });

  // ADDR-SCHEMA-002: Required field validation
  it("[P0] should reject address missing required address_line1", () => {
    const address = {
      city: "Atlanta",
      state_id: VALID_STATE_ID,
      county_id: VALID_COUNTY_ID,
      zip_code: "30301",
    };
    const result = USAddressSchema.safeParse(address);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(i => i.path.includes("address_line1"))).toBe(true);
    }
  });

  it("[P0] should reject address missing required city", () => {
    const address = {
      address_line1: "123 Main Street",
      state_id: VALID_STATE_ID,
      county_id: VALID_COUNTY_ID,
      zip_code: "30301",
    };
    const result = USAddressSchema.safeParse(address);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(i => i.path.includes("city"))).toBe(true);
    }
  });

  it("[P0] should reject address missing required state_id", () => {
    const address = {
      address_line1: "123 Main Street",
      city: "Atlanta",
      county_id: VALID_COUNTY_ID,
      zip_code: "30301",
    };
    const result = USAddressSchema.safeParse(address);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(i => i.path.includes("state_id"))).toBe(true);
    }
  });

  it("[P0] should reject address missing required zip_code", () => {
    const address = {
      address_line1: "123 Main Street",
      city: "Atlanta",
      state_id: VALID_STATE_ID,
      county_id: VALID_COUNTY_ID,
    };
    const result = USAddressSchema.safeParse(address);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(i => i.path.includes("zip_code"))).toBe(true);
    }
  });

  // ADDR-SCHEMA-003: UUID format validation
  it("[P0] should reject invalid UUID format for state_id", () => {
    const address = createValidStructuredAddress({ state_id: "not-a-uuid" });
    const result = USAddressSchema.safeParse(address);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(i =>
        i.path.includes("state_id") && i.message.toLowerCase().includes("uuid")
      )).toBe(true);
    }
  });

  it("[P0] should reject invalid UUID format for county_id", () => {
    const address = createValidStructuredAddress({ county_id: "invalid-uuid" });
    const result = USAddressSchema.safeParse(address);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(i =>
        i.path.includes("county_id") && i.message.toLowerCase().includes("uuid")
      )).toBe(true);
    }
  });

  // ADDR-SCHEMA-004: 5-digit ZIP code format validation
  it("[P1] should accept 5-digit ZIP code format", () => {
    const address = createValidStructuredAddress({ zip_code: "30301" });
    const result = USAddressSchema.safeParse(address);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.zip_code).toBe("30301");
    }
  });

  // ADDR-SCHEMA-005: ZIP+4 format validation
  it("[P1] should accept ZIP+4 format", () => {
    const address = createValidStructuredAddress({ zip_code: "30301-1234" });
    const result = USAddressSchema.safeParse(address);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.zip_code).toBe("30301-1234");
    }
  });

  // ADDR-SCHEMA-006: ZIP code rejection
  it("[P1] should reject invalid ZIP code format - 4 digits", () => {
    const address = createValidStructuredAddress({ zip_code: "1234" });
    const result = USAddressSchema.safeParse(address);

    expect(result.success).toBe(false);
  });

  it("[P1] should reject invalid ZIP code format - 6 digits", () => {
    const address = createValidStructuredAddress({ zip_code: "123456" });
    const result = USAddressSchema.safeParse(address);

    expect(result.success).toBe(false);
  });

  it("[P1] should reject invalid ZIP code format - letters", () => {
    const address = createValidStructuredAddress({ zip_code: "ABCDE" });
    const result = USAddressSchema.safeParse(address);

    expect(result.success).toBe(false);
  });

  it("[P1] should reject invalid ZIP+4 format - missing dash", () => {
    const address = createValidStructuredAddress({ zip_code: "303011234" });
    const result = USAddressSchema.safeParse(address);

    expect(result.success).toBe(false);
  });

  // ADDR-SCHEMA-007: Address line length validation
  it("[P1] should reject address_line1 exceeding 255 characters", () => {
    const address = createValidStructuredAddress({
      address_line1: "A".repeat(256)
    });
    const result = USAddressSchema.safeParse(address);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(i =>
        i.path.includes("address_line1")
      )).toBe(true);
    }
  });

  it("[P1] should accept address_line1 with exactly 255 characters", () => {
    const address = createValidStructuredAddress({
      address_line1: "A".repeat(255)
    });
    const result = USAddressSchema.safeParse(address);

    expect(result.success).toBe(true);
  });

  it("[P1] should reject address_line2 exceeding 255 characters", () => {
    const address = createValidStructuredAddress({
      address_line2: "B".repeat(256)
    });
    const result = USAddressSchema.safeParse(address);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(i =>
        i.path.includes("address_line2")
      )).toBe(true);
    }
  });

  // ADDR-SCHEMA-008: City length validation
  it("[P1] should reject city exceeding 100 characters", () => {
    const address = createValidStructuredAddress({
      city: "C".repeat(101)
    });
    const result = USAddressSchema.safeParse(address);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(i =>
        i.path.includes("city")
      )).toBe(true);
    }
  });

  it("[P1] should accept city with exactly 100 characters", () => {
    const address = createValidStructuredAddress({
      city: "C".repeat(100)
    });
    const result = USAddressSchema.safeParse(address);

    expect(result.success).toBe(true);
  });

  // Whitespace handling
  it("[P1] should trim whitespace from address_line1", () => {
    const address = createValidStructuredAddress({
      address_line1: "  123 Main Street  "
    });
    const result = USAddressSchema.safeParse(address);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.address_line1).toBe("123 Main Street");
    }
  });

  it("[P1] should trim whitespace from city", () => {
    const address = createValidStructuredAddress({
      city: "  Atlanta  "
    });
    const result = USAddressSchema.safeParse(address);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.city).toBe("Atlanta");
    }
  });

  it("[P1] should reject whitespace-only address_line1", () => {
    const address = createValidStructuredAddress({
      address_line1: "   "
    });
    const result = USAddressSchema.safeParse(address);

    expect(result.success).toBe(false);
  });

  it("[P1] should reject whitespace-only city", () => {
    const address = createValidStructuredAddress({
      city: "   "
    });
    const result = USAddressSchema.safeParse(address);

    expect(result.success).toBe(false);
  });
});

// =============================================================================
// createUserSchema Tests - Structured Address Integration
// =============================================================================

describe("createUserSchema - Structured Company Address Validation", () => {
  // ADDR-SCHEMA-001: Valid structured address acceptance
  it("[P0] should accept valid user creation with structured company address", () => {
    const validInput = createValidUserInput();
    const result = createUserSchema.safeParse(validInput);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.companyAddress).toBeDefined();
      expect(result.data.companyAddress?.address_line1).toBe("123 Main Street");
      expect(result.data.companyAddress?.city).toBe("Atlanta");
      expect(result.data.companyAddress?.state_id).toBe(VALID_STATE_ID);
    }
  });

  it("[P0] should accept user creation without company address (non-CLIENT_OWNER)", () => {
    const input = {
      email: "admin@test.com",
      name: "Test Admin",
      password: "StrongPass123!",
      roles: [{ role_id: VALID_ROLE_ID, scope_type: "SYSTEM" as const }],
    };
    const result = createUserSchema.safeParse(input);

    expect(result.success).toBe(true);
  });

  // Cross-field validation: companyName and companyAddress must come in pairs
  it("[P0] should reject companyName without companyAddress", () => {
    const input = {
      email: "client@test.com",
      name: "Test Client",
      password: "StrongPass123!",
      roles: [{ role_id: VALID_ROLE_ID, scope_type: "COMPANY" as const }],
      companyName: "Test Company",
      // companyAddress: NOT PROVIDED
    };
    const result = createUserSchema.safeParse(input);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(i =>
        i.path.includes("companyAddress")
      )).toBe(true);
    }
  });

  it("[P0] should reject companyAddress without companyName", () => {
    const input = {
      email: "client@test.com",
      name: "Test Client",
      password: "StrongPass123!",
      roles: [{ role_id: VALID_ROLE_ID, scope_type: "COMPANY" as const }],
      // companyName: NOT PROVIDED
      companyAddress: createValidStructuredAddress(),
    };
    const result = createUserSchema.safeParse(input);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(i =>
        i.path.includes("companyName")
      )).toBe(true);
    }
  });

  // Nested address validation errors bubble up correctly
  it("[P0] should reject invalid state_id in companyAddress", () => {
    const input = createValidUserInput({
      companyAddress: createValidStructuredAddress({ state_id: "invalid-uuid" }),
    });
    const result = createUserSchema.safeParse(input);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(i =>
        i.path.join(".").includes("companyAddress") &&
        i.path.join(".").includes("state_id")
      )).toBe(true);
    }
  });

  it("[P0] should reject missing required fields in companyAddress", () => {
    const input = createValidUserInput({
      companyAddress: {
        address_line1: "123 Main Street",
        // city: MISSING
        state_id: VALID_STATE_ID,
        zip_code: "30301",
      },
    });
    const result = createUserSchema.safeParse(input);

    // With Phase 4 backward compatibility, the union schema tries both:
    // 1. USAddressSchema (fails due to missing city)
    // 2. LegacyStringAddressSchema (fails because input is object, not string)
    // Both fail, so validation fails overall
    expect(result.success).toBe(false);
    if (!result.success) {
      // Union schema reports errors from both branches - check that companyAddress is in the path
      const hasCompanyAddressError = result.error.issues.some(i =>
        i.path.join(".").includes("companyAddress")
      );
      expect(hasCompanyAddressError).toBe(true);
    }
  });

  it("[P0] should accept valid structured address with minimal fields", () => {
    const input = createValidUserInput({
      companyAddress: {
        address_line1: "123 Main Street",
        city: "Atlanta",
        state_id: VALID_STATE_ID,
        zip_code: "30301",
        // address_line2: OMITTED (optional)
        // county_id: OMITTED (optional)
      },
    });
    const result = createUserSchema.safeParse(input);

    expect(result.success).toBe(true);
  });
});

// =============================================================================
// Type Inference Tests
// =============================================================================

describe("Type Inference - Structured Address", () => {
  it("should correctly infer companyAddress as USAddressInput type", () => {
    const validInput = createValidUserInput();
    const result = createUserSchema.parse(validInput);

    // TypeScript type inference test - these should compile without errors
    const address = result.companyAddress;
    if (address) {
      const addressLine1: string = address.address_line1;
      const city: string = address.city;
      const stateId: string = address.state_id;
      const zipCode: string = address.zip_code;

      expect(addressLine1).toBe("123 Main Street");
      expect(city).toBe("Atlanta");
      expect(stateId).toBe(VALID_STATE_ID);
      expect(zipCode).toBe("30301");
    }
  });
});

// =============================================================================
// Phase 4: Backward Compatibility Tests
// =============================================================================

describe("Phase 4: Backward Compatibility - Legacy String Address", () => {
  // ADDR-P4-001: Legacy string address acceptance
  it("[P0] should accept legacy string address format (deprecated)", () => {
    const input = {
      email: "legacy@test.com",
      name: "Legacy Test User",
      password: "StrongPass123!",
      roles: [{ role_id: VALID_ROLE_ID, scope_type: "COMPANY" as const }],
      companyName: "Legacy Company",
      companyAddress: "123 Main Street, Atlanta, GA 30301", // Legacy string format
    };

    const result = createUserSchema.safeParse(input);
    expect(result.success).toBe(true);

    if (result.success) {
      // The legacy string should be transformed into structured format
      expect(result.data.companyAddress).toBeDefined();
      expect(result.data.companyAddress?.address_line1).toBe("123 Main Street, Atlanta, GA 30301");
      // Legacy format should have _legacy flag
      expect((result.data.companyAddress as any)._legacy).toBe(true);
    }
  });

  // ADDR-P4-002: Legacy string validation constraints
  it("[P0] should reject empty legacy string address", () => {
    const input = {
      email: "legacy@test.com",
      name: "Legacy Test User",
      password: "StrongPass123!",
      roles: [{ role_id: VALID_ROLE_ID, scope_type: "COMPANY" as const }],
      companyName: "Legacy Company",
      companyAddress: "", // Empty string
    };

    const result = createUserSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  // ADDR-P4-003: Legacy string max length validation
  it("[P0] should reject legacy string exceeding 500 characters", () => {
    const input = {
      email: "legacy@test.com",
      name: "Legacy Test User",
      password: "StrongPass123!",
      roles: [{ role_id: VALID_ROLE_ID, scope_type: "COMPANY" as const }],
      companyName: "Legacy Company",
      companyAddress: "A".repeat(501), // 501 characters
    };

    const result = createUserSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  // ADDR-P4-004: Mixed format - structured takes priority
  it("[P0] should prefer structured format when both formats are valid", () => {
    // This tests the union schema behavior - structured should be tried first
    const structuredInput = {
      email: "structured@test.com",
      name: "Structured Test User",
      password: "StrongPass123!",
      roles: [{ role_id: VALID_ROLE_ID, scope_type: "COMPANY" as const }],
      companyName: "Structured Company",
      companyAddress: createValidStructuredAddress(),
    };

    const result = createUserSchema.safeParse(structuredInput);
    expect(result.success).toBe(true);

    if (result.success) {
      // Should NOT have _legacy flag when using structured format
      expect((result.data.companyAddress as any)._legacy).toBeUndefined();
    }
  });

  // ADDR-P4-005: Whitespace trimming for legacy addresses
  it("[P1] should trim whitespace from legacy string addresses", () => {
    const input = {
      email: "legacy@test.com",
      name: "Legacy Test User",
      password: "StrongPass123!",
      roles: [{ role_id: VALID_ROLE_ID, scope_type: "COMPANY" as const }],
      companyName: "Legacy Company",
      companyAddress: "   123 Main Street, Atlanta, GA 30301   ", // Whitespace
    };

    const result = createUserSchema.safeParse(input);
    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.companyAddress?.address_line1).toBe("123 Main Street, Atlanta, GA 30301");
    }
  });

  // ADDR-P4-006: Legacy address at boundary (exactly 500 chars)
  it("[P1] should accept legacy string with exactly 500 characters", () => {
    const input = {
      email: "legacy@test.com",
      name: "Legacy Test User",
      password: "StrongPass123!",
      roles: [{ role_id: VALID_ROLE_ID, scope_type: "COMPANY" as const }],
      companyName: "Legacy Company",
      companyAddress: "A".repeat(500), // Exactly 500 characters
    };

    const result = createUserSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  // ADDR-P4-007: Both formats work in union schema
  it("[P0] should parse both structured and string in same schema", () => {
    // First test structured
    const structuredInput = createValidUserInput();
    const structuredResult = createUserSchema.safeParse(structuredInput);
    expect(structuredResult.success).toBe(true);

    // Then test legacy string
    const legacyInput = {
      ...structuredInput,
      companyAddress: "456 Oak Ave, Miami, FL 33101",
    };
    const legacyResult = createUserSchema.safeParse(legacyInput);
    expect(legacyResult.success).toBe(true);
  });

  // ADDR-P4-008: Original value preserved in legacy format
  it("[P0] should preserve original value in _originalValue for legacy format", () => {
    const originalAddress = "  789 Pine Road, Suite 200, Dallas, TX 75001  ";
    const input = {
      email: "legacy@test.com",
      name: "Legacy Test User",
      password: "StrongPass123!",
      roles: [{ role_id: VALID_ROLE_ID, scope_type: "COMPANY" as const }],
      companyName: "Legacy Company",
      companyAddress: originalAddress,
    };

    const result = createUserSchema.safeParse(input);
    expect(result.success).toBe(true);

    if (result.success) {
      // Original value should be trimmed
      expect((result.data.companyAddress as any)._originalValue).toBe(originalAddress.trim());
    }
  });
});
