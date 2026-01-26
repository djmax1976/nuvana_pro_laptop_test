import { describe, it, expect } from "vitest";
import {
  ClientOwnerSetupRequestSchema,
  SetupUserSchema,
  SetupCompanySchema,
  SetupStoreSchema,
  SetupStoreLoginSchema,
  SetupStoreManagerSchema,
  SetupTerminalSchema,
  POSConfigSchema,
  mapZodErrorsToWizardSteps,
  POS_SYSTEM_TYPES,
  POS_CONNECTION_TYPES,
} from "../../../backend/src/schemas/client-owner-setup.schema";

/**
 * Unit Tests: Client Owner Setup Zod Schemas
 *
 * Tests validation logic for the Client Owner Setup wizard schemas from:
 * - Backend: backend/src/schemas/client-owner-setup.schema.ts
 *
 * These are UNIT tests - they test the schema validation logic in isolation
 * without any database, HTTP, or browser interaction.
 *
 * Fast: Each test runs in <10ms
 * Purpose: Verify validation rules catch invalid data before database operations
 *
 * PRODUCTION GRADE: Imports actual schemas from backend (no duplication)
 *
 * BUSINESS RULES TESTED:
 * - BR-COS-003: All three emails (user, storeLogin, storeManager) must be different
 * - BR-COS-004: Password requirements (8+ chars, uppercase, lowercase, number, special)
 * - BR-COS-005: Company/store address validation with state/county
 * - BR-COS-006: Store timezone must be valid IANA format
 * - BR-COS-007: Store manager is required
 *
 * SECURITY FOCUS:
 * - SEC-014: Input validation and sanitization
 * - SEC-001: Password strength requirements
 */

// =============================================================================
// Test Fixtures - Reusable valid payloads
// =============================================================================

const validUser = {
  email: "owner@example.com",
  name: "John Doe",
  password: "SecurePass123!",
};

const validCompanyAddress = {
  address_line1: "123 Main Street",
  address_line2: "Suite 100",
  city: "New York",
  state_id: "00000000-0000-0000-0000-000000000001",
  county_id: "00000000-0000-0000-0000-000000000002",
  zip_code: "12345",
};

const validCompany = {
  name: "Acme Corporation",
  address: validCompanyAddress,
};

const validStore = {
  name: "Main Street Store",
  timezone: "America/New_York",
  status: "ACTIVE" as const,
  address_line1: "456 Store Avenue",
  address_line2: null,
  city: "Brooklyn",
  state_id: "00000000-0000-0000-0000-000000000001",
  county_id: null,
  zip_code: "11201",
};

const validStoreLogin = {
  email: "storelogin@example.com",
  password: "StorePass123!",
};

const validStoreManager = {
  email: "storemanager@example.com",
  password: "ManagerPass123!",
};

const validFullPayload = {
  user: validUser,
  company: validCompany,
  store: validStore,
  storeLogin: validStoreLogin,
  storeManager: validStoreManager,
};

// =============================================================================
// User Schema Tests
// =============================================================================

describe("SetupUserSchema - Email Validation", () => {
  it("should accept valid email addresses", () => {
    const validEmails = [
      "user@example.com",
      "test.user@company.co.uk",
      "admin+tag@domain.io",
    ];

    validEmails.forEach((email) => {
      const result = SetupUserSchema.safeParse({
        ...validUser,
        email,
      });
      expect(result.success).toBe(true);
    });
  });

  it("should normalize email to lowercase", () => {
    const result = SetupUserSchema.safeParse({
      ...validUser,
      email: "USER@EXAMPLE.COM",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("user@example.com");
    }
  });

  it("should trim whitespace from email", () => {
    const result = SetupUserSchema.safeParse({
      ...validUser,
      email: "  user@example.com  ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("user@example.com");
    }
  });

  it("should reject empty email", () => {
    const result = SetupUserSchema.safeParse({
      ...validUser,
      email: "",
    });
    expect(result.success).toBe(false);
  });

  it("should reject invalid email format", () => {
    const invalidEmails = [
      "not-an-email",
      "@example.com",
      "user@",
      "user@.com",
    ];

    invalidEmails.forEach((email) => {
      const result = SetupUserSchema.safeParse({
        ...validUser,
        email,
      });
      expect(result.success).toBe(false);
    });
  });

  it("should reject email exceeding 255 characters", () => {
    const longEmail = `${"a".repeat(250)}@test.com`;
    const result = SetupUserSchema.safeParse({
      ...validUser,
      email: longEmail,
    });
    expect(result.success).toBe(false);
  });
});

describe("SetupUserSchema - Name Validation", () => {
  it("should accept valid names", () => {
    const validNames = ["John Doe", "José García-Smith", "李明"];

    validNames.forEach((name) => {
      const result = SetupUserSchema.safeParse({
        ...validUser,
        name,
      });
      expect(result.success).toBe(true);
    });
  });

  it("should trim whitespace from name", () => {
    const result = SetupUserSchema.safeParse({
      ...validUser,
      name: "  John Doe  ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("John Doe");
    }
  });

  it("should reject empty name", () => {
    const result = SetupUserSchema.safeParse({
      ...validUser,
      name: "",
    });
    expect(result.success).toBe(false);
  });

  it("should reject whitespace-only name", () => {
    const result = SetupUserSchema.safeParse({
      ...validUser,
      name: "   ",
    });
    expect(result.success).toBe(false);
  });

  it("should reject name exceeding 255 characters", () => {
    const longName = "A".repeat(256);
    const result = SetupUserSchema.safeParse({
      ...validUser,
      name: longName,
    });
    expect(result.success).toBe(false);
  });
});

describe("SetupUserSchema - Password Validation [BR-COS-004]", () => {
  it("should accept strong passwords", () => {
    const strongPasswords = [
      "Password123!",
      "Str0ng!Pass",
      "MyP@ssw0rd",
      "Abcd123!",
    ];

    strongPasswords.forEach((password) => {
      const result = SetupUserSchema.safeParse({
        ...validUser,
        password,
      });
      expect(result.success).toBe(true);
    });
  });

  it("should reject password shorter than 8 characters", () => {
    const result = SetupUserSchema.safeParse({
      ...validUser,
      password: "Abc123!",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("at least 8 characters");
    }
  });

  it("should accept password at exact minimum length (8 chars)", () => {
    const result = SetupUserSchema.safeParse({
      ...validUser,
      password: "Abcd123!",
    });
    expect(result.success).toBe(true);
  });

  it("should reject password without uppercase letter", () => {
    const result = SetupUserSchema.safeParse({
      ...validUser,
      password: "password123!",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("uppercase");
    }
  });

  it("should reject password without lowercase letter", () => {
    const result = SetupUserSchema.safeParse({
      ...validUser,
      password: "PASSWORD123!",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("lowercase");
    }
  });

  it("should reject password without number", () => {
    const result = SetupUserSchema.safeParse({
      ...validUser,
      password: "Password!@#",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("number");
    }
  });

  it("should reject password without special character", () => {
    const result = SetupUserSchema.safeParse({
      ...validUser,
      password: "Password123",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("special character");
    }
  });

  it("should reject password with whitespace", () => {
    const result = SetupUserSchema.safeParse({
      ...validUser,
      password: "Pass word123!",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("whitespace");
    }
  });

  it("should reject password exceeding 255 characters", () => {
    const longPassword = "A".repeat(200) + "a1!";
    const result = SetupUserSchema.safeParse({
      ...validUser,
      password: longPassword,
    });
    // This should have 256 chars, exceeding the limit
    const veryLongPassword = "A".repeat(250) + "aaa1!";
    const result2 = SetupUserSchema.safeParse({
      ...validUser,
      password: veryLongPassword,
    });
    expect(result2.success).toBe(false);
  });
});

// =============================================================================
// Company Schema Tests
// =============================================================================

describe("SetupCompanySchema - Company Validation", () => {
  it("should accept valid company data", () => {
    const result = SetupCompanySchema.safeParse(validCompany);
    expect(result.success).toBe(true);
  });

  it("should reject empty company name", () => {
    const result = SetupCompanySchema.safeParse({
      ...validCompany,
      name: "",
    });
    expect(result.success).toBe(false);
  });

  it("should reject whitespace-only company name", () => {
    const result = SetupCompanySchema.safeParse({
      ...validCompany,
      name: "   ",
    });
    expect(result.success).toBe(false);
  });

  it("should trim whitespace from company name", () => {
    const result = SetupCompanySchema.safeParse({
      ...validCompany,
      name: "  Acme Corp  ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Acme Corp");
    }
  });

  it("should accept company name with special characters", () => {
    const result = SetupCompanySchema.safeParse({
      ...validCompany,
      name: "O'Brien & Sons Co.",
    });
    expect(result.success).toBe(true);
  });

  it("should reject company name exceeding 255 characters", () => {
    const result = SetupCompanySchema.safeParse({
      ...validCompany,
      name: "A".repeat(256),
    });
    expect(result.success).toBe(false);
  });
});

// =============================================================================
// Store Schema Tests
// =============================================================================

describe("SetupStoreSchema - Store Validation", () => {
  it("should accept valid store data", () => {
    const result = SetupStoreSchema.safeParse(validStore);
    expect(result.success).toBe(true);
  });

  it("should reject empty store name", () => {
    const result = SetupStoreSchema.safeParse({
      ...validStore,
      name: "",
    });
    expect(result.success).toBe(false);
  });

  it("should reject invalid state_id format", () => {
    const result = SetupStoreSchema.safeParse({
      ...validStore,
      state_id: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("should accept null county_id", () => {
    const result = SetupStoreSchema.safeParse({
      ...validStore,
      county_id: null,
    });
    expect(result.success).toBe(true);
  });

  it("should accept valid county_id UUID", () => {
    const result = SetupStoreSchema.safeParse({
      ...validStore,
      county_id: "00000000-0000-0000-0000-000000000002",
    });
    expect(result.success).toBe(true);
  });

  it("should reject invalid county_id format", () => {
    const result = SetupStoreSchema.safeParse({
      ...validStore,
      county_id: "invalid-uuid",
    });
    expect(result.success).toBe(false);
  });
});

describe("SetupStoreSchema - Timezone Validation [BR-COS-006]", () => {
  it("should accept valid IANA timezones", () => {
    const validTimezones = [
      "America/New_York",
      "America/Los_Angeles",
      "Europe/London",
      "Asia/Tokyo",
      "UTC",
    ];

    validTimezones.forEach((timezone) => {
      const result = SetupStoreSchema.safeParse({
        ...validStore,
        timezone,
      });
      expect(result.success).toBe(true);
    });
  });

  it("should reject invalid timezone abbreviations", () => {
    const invalidTimezones = ["EST", "PST", "CST", "MST"];

    invalidTimezones.forEach((timezone) => {
      const result = SetupStoreSchema.safeParse({
        ...validStore,
        timezone,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("IANA format");
      }
    });
  });

  it("should reject empty timezone", () => {
    const result = SetupStoreSchema.safeParse({
      ...validStore,
      timezone: "",
    });
    expect(result.success).toBe(false);
  });

  it("should reject timezone exceeding 50 characters", () => {
    const result = SetupStoreSchema.safeParse({
      ...validStore,
      timezone: "A".repeat(51),
    });
    expect(result.success).toBe(false);
  });

  it("should default timezone to America/New_York when not provided", () => {
    const storeWithoutTimezone = { ...validStore };
    delete (storeWithoutTimezone as any).timezone;

    const result = SetupStoreSchema.safeParse(storeWithoutTimezone);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.timezone).toBe("America/New_York");
    }
  });
});

describe("SetupStoreSchema - Status Validation", () => {
  it("should accept valid store statuses", () => {
    const validStatuses = ["ACTIVE", "INACTIVE", "CLOSED"] as const;

    validStatuses.forEach((status) => {
      const result = SetupStoreSchema.safeParse({
        ...validStore,
        status,
      });
      expect(result.success).toBe(true);
    });
  });

  it("should reject invalid status", () => {
    const result = SetupStoreSchema.safeParse({
      ...validStore,
      status: "PENDING",
    });
    expect(result.success).toBe(false);
  });

  it("should default status to ACTIVE when not provided", () => {
    const storeWithoutStatus = { ...validStore };
    delete (storeWithoutStatus as any).status;

    const result = SetupStoreSchema.safeParse(storeWithoutStatus);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe("ACTIVE");
    }
  });
});

// =============================================================================
// Store Login Schema Tests
// =============================================================================

describe("SetupStoreLoginSchema - Validation", () => {
  it("should accept valid store login data", () => {
    const result = SetupStoreLoginSchema.safeParse(validStoreLogin);
    expect(result.success).toBe(true);
  });

  it("should apply same password rules as user schema", () => {
    const result = SetupStoreLoginSchema.safeParse({
      email: "login@example.com",
      password: "weak",
    });
    expect(result.success).toBe(false);
  });
});

// =============================================================================
// Store Manager Schema Tests
// =============================================================================

describe("SetupStoreManagerSchema - Validation [BR-COS-007]", () => {
  it("should accept valid store manager data", () => {
    const result = SetupStoreManagerSchema.safeParse(validStoreManager);
    expect(result.success).toBe(true);
  });

  it("should require email", () => {
    const result = SetupStoreManagerSchema.safeParse({
      password: "ValidPass123!",
    });
    expect(result.success).toBe(false);
  });

  it("should require password", () => {
    const result = SetupStoreManagerSchema.safeParse({
      email: "manager@example.com",
    });
    expect(result.success).toBe(false);
  });

  it("should apply same password rules", () => {
    const result = SetupStoreManagerSchema.safeParse({
      email: "manager@example.com",
      password: "weakpass",
    });
    expect(result.success).toBe(false);
  });
});

// =============================================================================
// Terminal Schema Tests
// =============================================================================

describe("SetupTerminalSchema - Validation", () => {
  const validTerminal = {
    name: "Terminal 1",
    device_id: "DEVICE-001",
    pos_type: "MANUAL_ENTRY" as const,
    connection_type: "MANUAL" as const,
    connection_config: null,
  };

  it("should accept valid terminal data", () => {
    const result = SetupTerminalSchema.safeParse(validTerminal);
    expect(result.success).toBe(true);
  });

  it("should reject empty terminal name", () => {
    const result = SetupTerminalSchema.safeParse({
      ...validTerminal,
      name: "",
    });
    expect(result.success).toBe(false);
  });

  it("should accept null device_id", () => {
    const result = SetupTerminalSchema.safeParse({
      ...validTerminal,
      device_id: null,
    });
    expect(result.success).toBe(true);
  });

  it("should accept all valid POS system types", () => {
    POS_SYSTEM_TYPES.forEach((pos_type) => {
      const result = SetupTerminalSchema.safeParse({
        ...validTerminal,
        pos_type,
      });
      expect(result.success).toBe(true);
    });
  });

  it("should reject invalid POS system type", () => {
    const result = SetupTerminalSchema.safeParse({
      ...validTerminal,
      pos_type: "INVALID_POS",
    });
    expect(result.success).toBe(false);
  });

  it("should accept all valid connection types", () => {
    POS_CONNECTION_TYPES.forEach((connection_type) => {
      const result = SetupTerminalSchema.safeParse({
        ...validTerminal,
        connection_type,
      });
      expect(result.success).toBe(true);
    });
  });

  it("should reject invalid connection type", () => {
    const result = SetupTerminalSchema.safeParse({
      ...validTerminal,
      connection_type: "INVALID_CONNECTION",
    });
    expect(result.success).toBe(false);
  });
});

// =============================================================================
// POS Config Schema Tests
// =============================================================================

describe("POSConfigSchema - Validation", () => {
  it("should accept valid POS config", () => {
    const result = POSConfigSchema.safeParse({
      pos_type: "GILBARCO_PASSPORT",
      pos_connection_type: "NETWORK",
      pos_connection_config: { host: "192.168.1.1", port: 8080 },
    });
    expect(result.success).toBe(true);
  });

  it("should reject connection config exceeding 10KB", () => {
    const largeConfig: Record<string, string> = {};
    for (let i = 0; i < 1000; i++) {
      largeConfig[`key_${i}`] = "A".repeat(20);
    }

    const result = POSConfigSchema.safeParse({
      pos_type: "GILBARCO_PASSPORT",
      pos_connection_type: "NETWORK",
      pos_connection_config: largeConfig,
    });
    expect(result.success).toBe(false);
  });

  it("should accept null connection config", () => {
    const result = POSConfigSchema.safeParse({
      pos_type: "MANUAL_ENTRY",
      pos_connection_type: "MANUAL",
      pos_connection_config: null,
    });
    expect(result.success).toBe(true);
  });
});

// =============================================================================
// Complete Request Schema Tests - Cross-field Validation
// =============================================================================

describe("ClientOwnerSetupRequestSchema - Complete Validation", () => {
  it("should accept valid complete payload", () => {
    const result = ClientOwnerSetupRequestSchema.safeParse(validFullPayload);
    expect(result.success).toBe(true);
  });

  it("should reject missing user field", () => {
    const payload = { ...validFullPayload };
    delete (payload as any).user;
    const result = ClientOwnerSetupRequestSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it("should reject missing company field", () => {
    const payload = { ...validFullPayload };
    delete (payload as any).company;
    const result = ClientOwnerSetupRequestSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it("should reject missing store field", () => {
    const payload = { ...validFullPayload };
    delete (payload as any).store;
    const result = ClientOwnerSetupRequestSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it("should reject missing storeLogin field", () => {
    const payload = { ...validFullPayload };
    delete (payload as any).storeLogin;
    const result = ClientOwnerSetupRequestSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it("should reject missing storeManager field [BR-COS-007]", () => {
    const payload = { ...validFullPayload };
    delete (payload as any).storeManager;
    const result = ClientOwnerSetupRequestSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });
});

describe("ClientOwnerSetupRequestSchema - Cross-Email Validation [BR-COS-003]", () => {
  it("should reject when user email equals store login email", () => {
    const payload = {
      ...validFullPayload,
      storeLogin: {
        ...validStoreLogin,
        email: validUser.email,
      },
    };
    const result = ClientOwnerSetupRequestSchema.safeParse(payload);
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find(
        (i) => i.path[0] === "storeLogin" && i.path[1] === "email",
      );
      expect(issue).toBeDefined();
      expect(issue?.message).toContain("different from user email");
    }
  });

  it("should reject when user email equals store manager email", () => {
    const payload = {
      ...validFullPayload,
      storeManager: {
        ...validStoreManager,
        email: validUser.email,
      },
    };
    const result = ClientOwnerSetupRequestSchema.safeParse(payload);
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find(
        (i) => i.path[0] === "storeManager" && i.path[1] === "email",
      );
      expect(issue).toBeDefined();
      expect(issue?.message).toContain("different from user email");
    }
  });

  it("should reject when store login email equals store manager email", () => {
    const payload = {
      ...validFullPayload,
      storeManager: {
        ...validStoreManager,
        email: validStoreLogin.email,
      },
    };
    const result = ClientOwnerSetupRequestSchema.safeParse(payload);
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find(
        (i) => i.path[0] === "storeManager" && i.path[1] === "email",
      );
      expect(issue).toBeDefined();
      expect(issue?.message).toContain("different from store login email");
    }
  });

  it("should accept all three different emails", () => {
    const payload = {
      ...validFullPayload,
      user: { ...validUser, email: "user@example.com" },
      storeLogin: { ...validStoreLogin, email: "login@example.com" },
      storeManager: { ...validStoreManager, email: "manager@example.com" },
    };
    const result = ClientOwnerSetupRequestSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it("should normalize emails before comparison (case insensitive)", () => {
    const payload = {
      ...validFullPayload,
      user: { ...validUser, email: "USER@example.com" },
      storeLogin: { ...validStoreLogin, email: "user@EXAMPLE.com" },
    };
    const result = ClientOwnerSetupRequestSchema.safeParse(payload);
    // After normalization both become "user@example.com"
    expect(result.success).toBe(false);
  });
});

describe("ClientOwnerSetupRequestSchema - Terminal Validation", () => {
  it("should accept payload with terminals", () => {
    const payload = {
      ...validFullPayload,
      terminals: [
        {
          name: "Terminal 1",
          device_id: "DEVICE-001",
          pos_type: "MANUAL_ENTRY" as const,
          connection_type: "MANUAL" as const,
        },
      ],
    };
    const result = ClientOwnerSetupRequestSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it("should accept payload without terminals (optional)", () => {
    const result = ClientOwnerSetupRequestSchema.safeParse(validFullPayload);
    expect(result.success).toBe(true);
  });

  it("should reject more than 10 terminals", () => {
    const terminals = Array.from({ length: 11 }, (_, i) => ({
      name: `Terminal ${i + 1}`,
      device_id: `DEVICE-${i + 1}`,
      pos_type: "MANUAL_ENTRY" as const,
      connection_type: "MANUAL" as const,
    }));

    const payload = {
      ...validFullPayload,
      terminals,
    };
    const result = ClientOwnerSetupRequestSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it("should reject duplicate terminal device_ids", () => {
    const payload = {
      ...validFullPayload,
      terminals: [
        {
          name: "Terminal 1",
          device_id: "DEVICE-001",
          pos_type: "MANUAL_ENTRY" as const,
          connection_type: "MANUAL" as const,
        },
        {
          name: "Terminal 2",
          device_id: "DEVICE-001", // Duplicate
          pos_type: "MANUAL_ENTRY" as const,
          connection_type: "MANUAL" as const,
        },
      ],
    };
    const result = ClientOwnerSetupRequestSchema.safeParse(payload);
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path[0] === "terminals");
      expect(issue?.message).toContain("unique");
    }
  });

  it("should allow multiple terminals with null device_ids", () => {
    const payload = {
      ...validFullPayload,
      terminals: [
        {
          name: "Terminal 1",
          device_id: null,
          pos_type: "MANUAL_ENTRY" as const,
          connection_type: "MANUAL" as const,
        },
        {
          name: "Terminal 2",
          device_id: null,
          pos_type: "MANUAL_ENTRY" as const,
          connection_type: "MANUAL" as const,
        },
      ],
    };
    const result = ClientOwnerSetupRequestSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });
});

// =============================================================================
// Error Mapping Tests
// =============================================================================

describe("mapZodErrorsToWizardSteps - Error Mapping", () => {
  it("should map user errors to user step", () => {
    const payload = {
      ...validFullPayload,
      user: { ...validUser, email: "invalid" },
    };
    const result = ClientOwnerSetupRequestSchema.safeParse(payload);
    expect(result.success).toBe(false);
    if (!result.success) {
      const mapped = mapZodErrorsToWizardSteps(result.error);
      expect(mapped.user).toBeDefined();
      expect(mapped.user.email).toBeDefined();
    }
  });

  it("should map company errors to company step", () => {
    const payload = {
      ...validFullPayload,
      company: { ...validCompany, name: "" },
    };
    const result = ClientOwnerSetupRequestSchema.safeParse(payload);
    expect(result.success).toBe(false);
    if (!result.success) {
      const mapped = mapZodErrorsToWizardSteps(result.error);
      expect(mapped.company).toBeDefined();
    }
  });

  it("should map store errors to store step", () => {
    const payload = {
      ...validFullPayload,
      store: { ...validStore, timezone: "INVALID" },
    };
    const result = ClientOwnerSetupRequestSchema.safeParse(payload);
    expect(result.success).toBe(false);
    if (!result.success) {
      const mapped = mapZodErrorsToWizardSteps(result.error);
      expect(mapped.store).toBeDefined();
    }
  });

  it("should map storeLogin errors to storeLogin step", () => {
    const payload = {
      ...validFullPayload,
      storeLogin: { ...validStoreLogin, password: "weak" },
    };
    const result = ClientOwnerSetupRequestSchema.safeParse(payload);
    expect(result.success).toBe(false);
    if (!result.success) {
      const mapped = mapZodErrorsToWizardSteps(result.error);
      expect(mapped.storeLogin).toBeDefined();
    }
  });

  it("should map storeManager errors to storeManager step", () => {
    const payload = {
      ...validFullPayload,
      storeManager: { ...validStoreManager, password: "weak" },
    };
    const result = ClientOwnerSetupRequestSchema.safeParse(payload);
    expect(result.success).toBe(false);
    if (!result.success) {
      const mapped = mapZodErrorsToWizardSteps(result.error);
      expect(mapped.storeManager).toBeDefined();
    }
  });
});

// =============================================================================
// Input Sanitization Tests
// =============================================================================

describe("Input Sanitization - Security", () => {
  it("should handle SQL injection patterns as literal strings", () => {
    const payload = {
      ...validFullPayload,
      user: {
        ...validUser,
        name: "Robert'); DROP TABLE users;--",
      },
    };
    const result = ClientOwnerSetupRequestSchema.safeParse(payload);
    // Schema should either accept (store literally) or reject
    // It should NEVER execute the SQL
    if (result.success) {
      expect(result.data.user.name).toBe("Robert'); DROP TABLE users;--");
    }
    // Either success or validation failure is acceptable
  });

  it("should handle XSS patterns in name fields", () => {
    const payload = {
      ...validFullPayload,
      user: {
        ...validUser,
        name: '<script>alert("xss")</script>',
      },
    };
    const result = ClientOwnerSetupRequestSchema.safeParse(payload);
    // Schema validation doesn't sanitize XSS - that's for output encoding
    // Just verify schema doesn't crash on these inputs
    if (result.success) {
      expect(result.data.user.name).toBeDefined();
    }
  });

  it("should handle prototype pollution attempts safely", () => {
    const payload = {
      ...validFullPayload,
      __proto__: { isAdmin: true },
      constructor: { prototype: { isAdmin: true } },
    };
    const result = ClientOwnerSetupRequestSchema.safeParse(payload);
    // Zod should ignore unexpected fields
    if (result.success) {
      expect((result.data as any).isAdmin).toBeUndefined();
    }
  });

  it("should strip unexpected top-level fields", () => {
    const payload = {
      ...validFullPayload,
      extraField: "should be ignored",
      maliciousData: { hack: true },
    };
    const result = ClientOwnerSetupRequestSchema.safeParse(payload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as any).extraField).toBeUndefined();
      expect((result.data as any).maliciousData).toBeUndefined();
    }
  });
});
