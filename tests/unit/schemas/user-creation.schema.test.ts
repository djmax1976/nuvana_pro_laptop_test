import { describe, it, expect } from "vitest";
import {
  createUserSchema,
  roleAssignmentSchema,
} from "../../../backend/src/schemas/user.schema";

/**
 * Unit Tests: User Creation Zod Schemas
 *
 * Tests validation logic for user creation schemas from:
 * - Backend: backend/src/schemas/user.schema.ts (shared schemas)
 *
 * These are UNIT tests - they test the schema validation logic in isolation
 * without any database, HTTP, or browser interaction.
 *
 * Fast: Each test runs in <10ms
 * Purpose: Verify validation rules catch invalid data
 *
 * PRODUCTION GRADE: Imports actual schemas from backend (no duplication)
 */

describe("User Creation Schema - Email Validation", () => {
  it("should accept valid email addresses", () => {
    const validEmails = [
      "user@example.com",
      "test.user@company.co.uk",
      "admin+tag@domain.io",
      "user123@test-domain.com",
    ];

    validEmails.forEach((email) => {
      const result = createUserSchema
        .pick({ email: true })
        .safeParse({ email });
      expect(result.success).toBe(true);
    });
  });

  it("should reject invalid email formats", () => {
    const invalidEmails = [
      "not-an-email",
      "@example.com",
      "user@",
      "user space@example.com",
      "user@.com",
      "",
    ];

    invalidEmails.forEach((email) => {
      const result = createUserSchema
        .pick({ email: true })
        .safeParse({ email });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("Invalid email");
      }
    });
  });

  it("should reject emails exceeding 255 characters", () => {
    const longEmail = `${"a".repeat(250)}@example.com`; // 262 chars total
    const result = createUserSchema
      .pick({ email: true })
      .safeParse({ email: longEmail });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain(
        "cannot exceed 255 characters",
      );
    }
  });
});

describe("User Creation Schema - Name Validation", () => {
  it("should accept valid names", () => {
    const validNames = [
      "John Doe",
      "Mary Jane Watson-Parker",
      "José García",
      "李明",
      "a", // Single character
      "A".repeat(255), // Max length
    ];

    validNames.forEach((name) => {
      const result = createUserSchema.pick({ name: true }).safeParse({ name });
      expect(result.success).toBe(true);
    });
  });

  it("should reject empty names", () => {
    const result = createUserSchema
      .pick({ name: true })
      .safeParse({ name: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("Name is required");
    }
  });

  it("should reject whitespace-only names", () => {
    const whitespaceNames = ["   ", "\t", "\n", "  \t\n  "];

    whitespaceNames.forEach((name) => {
      const result = createUserSchema.pick({ name: true }).safeParse({ name });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("whitespace");
      }
    });
  });

  it("should reject names exceeding 255 characters", () => {
    const longName = "A".repeat(256);
    const result = createUserSchema
      .pick({ name: true })
      .safeParse({ name: longName });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain(
        "cannot exceed 255 characters",
      );
    }
  });
});

describe("User Creation Schema - Password Validation", () => {
  it("should accept strong passwords", () => {
    const strongPasswords = [
      "Password123!",
      "Str0ng!Pass",
      "MyP@ssw0rd",
      "C0mplex#Pass",
      "T3st!ngP@ss",
    ];

    strongPasswords.forEach((password) => {
      const result = createUserSchema
        .pick({ password: true })
        .safeParse({ password });
      expect(result.success).toBe(true);
    });
  });

  it("should reject passwords shorter than 8 characters", () => {
    const result = createUserSchema
      .pick({ password: true })
      .safeParse({ password: "Short1!" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("at least 8 characters");
    }
  });

  it("should reject passwords without uppercase letters", () => {
    const result = createUserSchema
      .pick({ password: true })
      .safeParse({ password: "password123!" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("uppercase");
    }
  });

  it("should reject passwords without lowercase letters", () => {
    const result = createUserSchema
      .pick({ password: true })
      .safeParse({ password: "PASSWORD123!" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("lowercase");
    }
  });

  it("should reject passwords without numbers", () => {
    const result = createUserSchema
      .pick({ password: true })
      .safeParse({ password: "Password!" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("number");
    }
  });

  it("should reject passwords without special characters", () => {
    const result = createUserSchema
      .pick({ password: true })
      .safeParse({ password: "Password123" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("special character");
    }
  });

  it("should allow password to be optional (for SSO users)", () => {
    const result = createUserSchema.pick({ password: true }).safeParse({});
    expect(result.success).toBe(true);
  });
});

describe("User Creation Schema - Role Assignment Validation", () => {
  it("should accept valid role assignments", () => {
    const validRoleId = "123e4567-e89b-12d3-a456-426614174000";
    const validData = {
      roles: [{ role_id: validRoleId, scope_type: "SYSTEM" as const }],
    };

    const result = createUserSchema.pick({ roles: true }).safeParse(validData);
    expect(result.success).toBe(true);
  });

  it("should reject empty roles array", () => {
    const result = createUserSchema
      .pick({ roles: true })
      .safeParse({ roles: [] });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("At least one role");
    }
  });

  it("should reject invalid role_id format", () => {
    const result = createUserSchema.pick({ roles: true }).safeParse({
      roles: [{ role_id: "not-a-uuid", scope_type: "SYSTEM" }],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("Invalid role ID");
    }
  });

  it("should reject invalid scope_type", () => {
    const validRoleId = "123e4567-e89b-12d3-a456-426614174000";
    const result = createUserSchema.pick({ roles: true }).safeParse({
      roles: [{ role_id: validRoleId, scope_type: "INVALID" }],
    });
    expect(result.success).toBe(false);
  });
});

describe("User Creation Schema - Company Fields Validation", () => {
  it("should accept valid company name", () => {
    const result = createUserSchema.pick({ companyName: true }).safeParse({
      companyName: "Acme Corporation",
    });
    expect(result.success).toBe(true);
  });

  it("should reject empty company name when provided", () => {
    const result = createUserSchema.pick({ companyName: true }).safeParse({
      companyName: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain(
        "Company name is required",
      );
    }
  });

  it("should reject company name exceeding 255 characters", () => {
    const longName = "A".repeat(256);
    const result = createUserSchema.pick({ companyName: true }).safeParse({
      companyName: longName,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain(
        "cannot exceed 255 characters",
      );
    }
  });

  it("should accept valid company address", () => {
    const result = createUserSchema.pick({ companyAddress: true }).safeParse({
      companyAddress: "123 Main St, City, State 12345",
    });
    expect(result.success).toBe(true);
  });

  it("should reject empty company address when provided", () => {
    const result = createUserSchema.pick({ companyAddress: true }).safeParse({
      companyAddress: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain(
        "Company address is required",
      );
    }
  });

  it("should reject company address exceeding 500 characters", () => {
    const longAddress = "A".repeat(501);
    const result = createUserSchema.pick({ companyAddress: true }).safeParse({
      companyAddress: longAddress,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain(
        "cannot exceed 500 characters",
      );
    }
  });

  it("should allow company fields to be optional", () => {
    const result = createUserSchema
      .pick({ companyName: true, companyAddress: true })
      .safeParse({});
    expect(result.success).toBe(true);
  });
});

describe("User Creation Schema - Full Payload Validation", () => {
  it("should accept complete valid user creation payload", () => {
    const validPayload = {
      email: "test@example.com",
      name: "Test User",
      password: "StrongPassword123!",
      roles: [
        {
          role_id: "123e4567-e89b-12d3-a456-426614174000",
          scope_type: "SYSTEM" as const,
        },
      ],
    };

    const result = createUserSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
  });

  it("should accept CLIENT_OWNER user with company fields", () => {
    const validPayload = {
      email: "owner@example.com",
      name: "Company Owner",
      password: "StrongPassword123!",
      roles: [
        {
          role_id: "123e4567-e89b-12d3-a456-426614174000",
          scope_type: "COMPANY" as const,
        },
      ],
      companyName: "Acme Corporation",
      companyAddress: "123 Main St",
    };

    const result = createUserSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
  });

  it("should reject payload with multiple validation errors", () => {
    const invalidPayload = {
      email: "not-an-email",
      name: "",
      password: "weak",
      roles: [],
    };

    const result = createUserSchema.safeParse(invalidPayload);
    expect(result.success).toBe(false);
    if (!result.success) {
      // Should have multiple errors
      expect(result.error.issues.length).toBeGreaterThan(1);
    }
  });
});
