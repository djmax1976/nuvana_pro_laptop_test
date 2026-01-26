/**
 * Client Owner Setup Validation Schemas
 *
 * Enterprise-grade Zod schemas for atomic creation of User + Company + Store + Store Login.
 * This endpoint supports the Super Admin wizard flow for creating a complete client setup.
 *
 * @enterprise-standards
 * - API-001: VALIDATION - Schema validation for every request payload
 * - SEC-014: INPUT_VALIDATION - Strict allowlists and sanitization
 * - SEC-001: PASSWORD_HASHING - Password requirements enforced (hashing in service layer)
 * - DB-006: TENANT_ISOLATION - Proper scoping enforced
 * - FE-002: FORM_VALIDATION - Mirror frontend validation schemas
 */

import { z } from "zod";
import { USAddressSchema, ZipPlus4Schema } from "./address.schema";

// =============================================================================
// Constants
// =============================================================================

/**
 * POS System Types supported by the platform
 * Allowlist validation per SEC-014
 */
export const POS_SYSTEM_TYPES = [
  "GILBARCO_PASSPORT",
  "GILBARCO_NAXML",
  "GILBARCO_COMMANDER",
  "VERIFONE_RUBY2",
  "VERIFONE_COMMANDER",
  "VERIFONE_SAPPHIRE",
  "CLOVER_REST",
  "ORACLE_SIMPHONY",
  "NCR_ALOHA",
  "LIGHTSPEED_REST",
  "SQUARE_REST",
  "TOAST_REST",
  "GENERIC_XML",
  "GENERIC_REST",
  "MANUAL_ENTRY",
] as const;

export type POSSystemType = (typeof POS_SYSTEM_TYPES)[number];

/**
 * POS Connection Types supported by the platform
 * Allowlist validation per SEC-014
 */
export const POS_CONNECTION_TYPES = [
  "NETWORK",
  "API",
  "WEBHOOK",
  "FILE",
  "MANUAL",
] as const;

export type POSConnectionType = (typeof POS_CONNECTION_TYPES)[number];

// =============================================================================
// Reusable Field Schemas
// =============================================================================

/**
 * Email validation schema
 * SEC-014: Strict format validation and sanitization
 */
const emailSchema = z
  .string()
  .min(1, "Email is required")
  .email("Invalid email format")
  .max(255, "Email cannot exceed 255 characters")
  .transform((val) => val.toLowerCase().trim());

/**
 * Password validation schema
 * SEC-001: Strong password requirements
 * - Minimum 8 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one number
 * - At least one special character
 */
const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(255, "Password cannot exceed 255 characters")
  .refine((val) => !/\s/.test(val), {
    message: "Password cannot contain whitespace",
  })
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter")
  .regex(/[0-9]/, "Password must contain at least one number")
  .regex(
    /[^A-Za-z0-9]/,
    "Password must contain at least one special character",
  );

/**
 * Name validation schema
 * SEC-014: Sanitization and length constraints
 */
const nameSchema = z
  .string()
  .min(1, "Name is required")
  .max(255, "Name cannot exceed 255 characters")
  .transform((val) => val.trim())
  .refine((val) => val.length > 0, {
    message: "Name cannot be whitespace only",
  });

/**
 * IANA Timezone validation
 * Safe regex pattern to prevent ReDoS attacks
 */
function validateIANATimezoneFormat(timezone: string): boolean {
  if (timezone === "UTC") return true;
  if (/^GMT[+-]\d{1,2}$/.test(timezone)) return true;
  if (timezone.length > 50) return false;

  const parts = timezone.split("/");
  if (parts.length < 2 || parts.length > 3) return false;

  const segmentPattern = /^[A-Za-z_]+$/;
  return parts.every((part) => segmentPattern.test(part));
}

// =============================================================================
// User Schema
// =============================================================================

/**
 * User input for Client Owner Setup
 * Creates the CLIENT_OWNER user who will own the company
 */
export const SetupUserSchema = z.object({
  email: emailSchema,
  name: nameSchema,
  password: passwordSchema,
});

export type SetupUserInput = z.infer<typeof SetupUserSchema>;

// =============================================================================
// Company Schema
// =============================================================================

/**
 * Company input for Client Owner Setup
 * Creates the company that the CLIENT_OWNER will own
 */
export const SetupCompanySchema = z.object({
  name: z
    .string()
    .min(1, "Company name is required")
    .max(255, "Company name cannot exceed 255 characters")
    .transform((val) => val.trim())
    .refine((val) => val.length > 0, {
      message: "Company name cannot be whitespace only",
    }),
  address: USAddressSchema,
});

export type SetupCompanyInput = z.infer<typeof SetupCompanySchema>;

// =============================================================================
// Store Schema
// =============================================================================

/**
 * POS Configuration schema
 * SEC-014: Allowlist validation for POS types and connection types
 */
export const POSConfigSchema = z
  .object({
    pos_type: z.enum(POS_SYSTEM_TYPES).default("MANUAL_ENTRY"),
    pos_connection_type: z.enum(POS_CONNECTION_TYPES).default("MANUAL"),
    pos_connection_config: z
      .record(z.string(), z.unknown())
      .nullable()
      .optional()
      .refine(
        (val) => {
          // Limit JSON config size to 10KB to prevent DoS
          if (val === null || val === undefined) return true;
          const jsonStr = JSON.stringify(val);
          return jsonStr.length <= 10240;
        },
        { message: "POS connection config cannot exceed 10KB" },
      ),
  })
  .optional();

export type POSConfigInput = z.infer<typeof POSConfigSchema>;

/**
 * Store input for Client Owner Setup
 * Creates the first store for the company
 */
export const SetupStoreSchema = z.object({
  name: z
    .string()
    .min(1, "Store name is required")
    .max(255, "Store name cannot exceed 255 characters")
    .transform((val) => val.trim())
    .refine((val) => val.length > 0, {
      message: "Store name cannot be whitespace only",
    }),
  timezone: z
    .string()
    .min(1, "Timezone is required")
    .max(50, "Timezone cannot exceed 50 characters")
    .default("America/New_York")
    .refine((val) => validateIANATimezoneFormat(val), {
      message:
        "Timezone must be in IANA format (e.g., America/New_York, Europe/London)",
    }),
  status: z.enum(["ACTIVE", "INACTIVE", "CLOSED"]).default("ACTIVE"),
  // Structured address fields
  address_line1: z
    .string()
    .min(1, "Store address is required")
    .max(255, "Address line 1 cannot exceed 255 characters")
    .transform((val) => val.trim()),
  address_line2: z
    .string()
    .max(255, "Address line 2 cannot exceed 255 characters")
    .transform((val) => val.trim())
    .nullable()
    .optional(),
  city: z
    .string()
    .min(1, "City is required")
    .max(100, "City cannot exceed 100 characters")
    .transform((val) => val.trim()),
  state_id: z.string().uuid("state_id must be a valid UUID"),
  county_id: z
    .string()
    .uuid("county_id must be a valid UUID")
    .nullable()
    .optional(),
  zip_code: ZipPlus4Schema,
  // POS configuration
  pos_config: POSConfigSchema,
});

export type SetupStoreInput = z.infer<typeof SetupStoreSchema>;

// =============================================================================
// Store Login Schema
// =============================================================================

/**
 * Store Login input for Client Owner Setup
 * Creates the CLIENT_USER who will manage the store
 */
export const SetupStoreLoginSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

export type SetupStoreLoginInput = z.infer<typeof SetupStoreLoginSchema>;

// =============================================================================
// Store Manager Schema
// =============================================================================

/**
 * Store Manager input for Client Owner Setup
 * Creates the STORE_MANAGER who is required for desktop app functionality
 *
 * The store manager is a mandatory user because the desktop application
 * requires a manager-level account to perform certain operations.
 */
export const SetupStoreManagerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

export type SetupStoreManagerInput = z.infer<typeof SetupStoreManagerSchema>;

// =============================================================================
// Terminal Schema
// =============================================================================

/**
 * Terminal input for optional terminal creation
 */
export const SetupTerminalSchema = z.object({
  name: z
    .string()
    .min(1, "Terminal name is required")
    .max(100, "Terminal name cannot exceed 100 characters")
    .transform((val) => val.trim()),
  device_id: z
    .string()
    .max(255, "Device ID cannot exceed 255 characters")
    .transform((val) => val.trim())
    .nullable()
    .optional(),
  pos_type: z.enum(POS_SYSTEM_TYPES).default("MANUAL_ENTRY"),
  connection_type: z.enum(POS_CONNECTION_TYPES).default("MANUAL"),
  connection_config: z
    .record(z.string(), z.unknown())
    .nullable()
    .optional()
    .refine(
      (val) => {
        if (val === null || val === undefined) return true;
        const jsonStr = JSON.stringify(val);
        return jsonStr.length <= 10240;
      },
      { message: "Terminal connection config cannot exceed 10KB" },
    ),
});

export type SetupTerminalInput = z.infer<typeof SetupTerminalSchema>;

// =============================================================================
// Complete Client Owner Setup Schema
// =============================================================================

/**
 * Complete Client Owner Setup Request Schema
 *
 * Validates the complete wizard payload for atomic creation of:
 * 1. User (CLIENT_OWNER)
 * 2. Company (owned by user)
 * 3. Store (first store for company)
 * 4. Store Login (CLIENT_USER for store management)
 * 5. Store Manager (STORE_MANAGER for desktop app - required)
 * 6. Terminals (optional)
 *
 * Cross-field validation ensures:
 * - User email, store login email, and store manager email are all different
 * - All required nested objects are present
 *
 * @enterprise-standards
 * - API-001: VALIDATION - Complete schema validation
 * - SEC-014: INPUT_VALIDATION - Strict allowlists and sanitization
 */
export const ClientOwnerSetupRequestSchema = z
  .object({
    user: SetupUserSchema,
    company: SetupCompanySchema,
    store: SetupStoreSchema,
    storeLogin: SetupStoreLoginSchema,
    storeManager: SetupStoreManagerSchema,
    terminals: z
      .array(SetupTerminalSchema)
      .max(10, "Maximum 10 terminals allowed")
      .optional(),
  })
  .superRefine((data, ctx) => {
    // Cross-field validation: All emails must be different
    // This ensures proper separation of owner, store login, and store manager accounts
    const emails = [
      { email: data.user.email, field: "user" },
      { email: data.storeLogin.email, field: "storeLogin" },
      { email: data.storeManager.email, field: "storeManager" },
    ];

    // Check user email vs store login email
    if (data.user.email === data.storeLogin.email) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Store login email must be different from user email",
        path: ["storeLogin", "email"],
      });
    }

    // Check user email vs store manager email
    if (data.user.email === data.storeManager.email) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Store manager email must be different from user email",
        path: ["storeManager", "email"],
      });
    }

    // Check store login email vs store manager email
    if (data.storeLogin.email === data.storeManager.email) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Store manager email must be different from store login email",
        path: ["storeManager", "email"],
      });
    }

    // Validate terminal device_ids are unique if provided
    if (data.terminals && data.terminals.length > 0) {
      const deviceIds = data.terminals
        .map((t) => t.device_id)
        .filter(
          (id): id is string => id !== null && id !== undefined && id !== "",
        );

      const uniqueDeviceIds = new Set(deviceIds);
      if (deviceIds.length !== uniqueDeviceIds.size) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Terminal device IDs must be unique",
          path: ["terminals"],
        });
      }
    }
  });

export type ClientOwnerSetupRequest = z.infer<
  typeof ClientOwnerSetupRequestSchema
>;

// =============================================================================
// Response Types (TypeScript only - not Zod validated)
// =============================================================================

/**
 * Successful Client Owner Setup Response
 */
export interface ClientOwnerSetupResponse {
  success: true;
  data: {
    user: {
      user_id: string;
      public_id: string;
      email: string;
      name: string;
      status: string;
      roles: Array<{
        user_role_id: string;
        role_code: string;
        scope: string;
        company_id: string;
      }>;
      created_at: string;
    };
    company: {
      company_id: string;
      public_id: string;
      name: string;
      address_line1: string;
      address_line2: string | null;
      city: string;
      state_id: string;
      state_code: string;
      state_name: string;
      county_id: string | null;
      county_name: string | null;
      zip_code: string;
      status: string;
      created_at: string;
    };
    store: {
      store_id: string;
      public_id: string;
      name: string;
      timezone: string;
      address_line1: string;
      address_line2: string | null;
      city: string;
      state_id: string;
      state_code: string;
      state_name: string;
      county_id: string | null;
      county_name: string | null;
      zip_code: string;
      pos_type: string;
      pos_connection_type: string;
      pos_connection_config: Record<string, unknown> | null;
      status: string;
      created_at: string;
    };
    storeLogin: {
      user_id: string;
      public_id: string;
      email: string;
      name: string;
      status: string;
      created_at: string;
    };
    storeManager: {
      user_id: string;
      public_id: string;
      email: string;
      name: string;
      status: string;
      created_at: string;
    };
    terminals?: Array<{
      pos_terminal_id: string;
      name: string;
      device_id: string | null;
      connection_type: string;
      pos_type: string;
    }>;
  };
  meta: {
    request_id: string;
    timestamp: string;
    transaction_id: string;
  };
}

/**
 * Error response with field-level error mapping for wizard steps
 */
export interface ClientOwnerSetupErrorResponse {
  success: false;
  error: {
    code: "VALIDATION_ERROR" | "CONFLICT" | "NOT_FOUND" | "INTERNAL_ERROR";
    message: string;
    /** Field-level errors mapped to wizard steps */
    details?: {
      /** Maps to wizard step 1: User Details */
      user?: Record<string, string>;
      /** Maps to wizard step 2: Company Details */
      company?: Record<string, string>;
      /** Maps to wizard step 3: Store Details */
      store?: Record<string, string>;
      /** Maps to wizard step 4: Store Login */
      storeLogin?: Record<string, string>;
      /** Maps to wizard step 5: Store Manager */
      storeManager?: Record<string, string>;
      /** Terminal errors */
      terminals?: Record<string, string>;
    };
  };
}

// =============================================================================
// Validation Helper Functions
// =============================================================================

/**
 * Validate Client Owner Setup request
 * @param data - Raw request data
 * @returns Validated and typed request input
 * @throws ZodError if validation fails
 */
export function validateClientOwnerSetupRequest(
  data: unknown,
): ClientOwnerSetupRequest {
  return ClientOwnerSetupRequestSchema.parse(data);
}

/**
 * Safe validation for Client Owner Setup request
 * @param data - Raw request data
 * @returns SafeParseResult with success flag and data/error
 */
export function safeValidateClientOwnerSetupRequest(data: unknown) {
  return ClientOwnerSetupRequestSchema.safeParse(data);
}

/**
 * Map Zod validation errors to wizard step field details
 * Used for frontend error display and navigation
 */
export function mapZodErrorsToWizardSteps(
  zodError: z.ZodError,
): Record<string, Record<string, string>> {
  const details: Record<string, Record<string, string>> = {};

  for (const issue of zodError.issues) {
    const path = issue.path;

    if (path.length >= 2) {
      const entity = path[0] as string; // "user", "company", "store", "storeLogin", "terminals"
      const field = path.slice(1).join("."); // e.g., "address.state_id" or "0.name"

      if (!Object.hasOwn(details, entity)) {
        // eslint-disable-next-line security/detect-object-injection -- entity from trusted Zod path
        details[entity] = {};
      }
      // eslint-disable-next-line security/detect-object-injection -- entity/field from trusted Zod path
      details[entity][field] = issue.message;
    } else if (path.length === 1) {
      // Top-level field error
      const entity = path[0] as string;
      if (!Object.hasOwn(details, entity)) {
        // eslint-disable-next-line security/detect-object-injection -- entity from trusted Zod path
        details[entity] = {};
      }
      // eslint-disable-next-line security/detect-object-injection -- entity from trusted Zod path
      details[entity]["_root"] = issue.message;
    }
  }

  return details;
}
