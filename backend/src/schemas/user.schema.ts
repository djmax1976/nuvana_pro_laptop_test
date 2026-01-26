import { z } from "zod";
import { USAddressSchema, type USAddressInput } from "./address.schema";

// =============================================================================
// Phase 4: Backward Compatibility - Legacy Address Support
// =============================================================================

/**
 * Legacy address marker interface
 * Used to identify addresses that were provided in legacy string format
 * @internal For backward compatibility tracking only
 */
interface LegacyAddressMarker {
  /** Flag indicating this address was parsed from legacy string format */
  _legacy: true;
  /** The original legacy address string (preserved for debugging) */
  _originalValue: string;
}

/**
 * Legacy String Address Schema
 * Accepts the deprecated string format for backward compatibility with existing API consumers.
 *
 * @deprecated Use USAddressSchema (structured format) instead. This will be removed in v2.0.
 *
 * Phase 4: Backward Compatibility (TASK-4.6)
 * - Transforms legacy string addresses into a minimal structured format
 * - Sets address_line1 to the full legacy string
 * - Marks with _legacy flag for downstream processing
 *
 * API-001 VALIDATION: Still validates string format constraints
 * SEC-014 INPUT_VALIDATION: Applies sanitization (trim, max length)
 */
export const LegacyStringAddressSchema = z
  .string()
  .min(1, "Company address cannot be empty")
  .max(500, "Company address cannot exceed 500 characters")
  .refine((val) => val.trim().length > 0, {
    message: "Company address cannot be whitespace only",
  })
  .transform((val): USAddressInput & LegacyAddressMarker => {
    // Phase 4 TASK-4.7: Log deprecation warning
    console.warn(
      "[DEPRECATION WARNING] String-based companyAddress is deprecated. " +
        "Please migrate to structured address format with address_line1, city, state_id, county_id, zip_code. " +
        "String format will be removed in v2.0.",
    );

    // Transform to minimal structured format
    // The service layer will detect _legacy flag and handle appropriately
    return {
      address_line1: val.trim(),
      address_line2: null,
      city: "", // Empty - legacy format doesn't provide structured city
      state_id: "", // Empty - requires frontend/API consumer to provide proper UUID
      county_id: null,
      zip_code: "", // Empty - legacy format doesn't provide structured zip
      _legacy: true,
      _originalValue: val.trim(),
    } as USAddressInput & LegacyAddressMarker;
  });

/**
 * Company Address Schema with Backward Compatibility
 *
 * Phase 4: Data Migration & Backward Compatibility (TASK-4.6)
 *
 * Accepts EITHER format for backward compatibility:
 * 1. **Structured format (PREFERRED)** - USAddressSchema with all geographic fields
 * 2. **Legacy string format (DEPRECATED)** - Single string address
 *
 * API Contract:
 * - New integrations MUST use structured format
 * - Existing integrations MAY continue using string format (with deprecation warning)
 * - String format will be removed in v2.0 (set deprecation timeline accordingly)
 *
 * @example Structured format (PREFERRED):
 * ```json
 * {
 *   "companyAddress": {
 *     "address_line1": "123 Main Street",
 *     "address_line2": "Suite 100",
 *     "city": "Atlanta",
 *     "state_id": "uuid-of-georgia-state",
 *     "county_id": "uuid-of-fulton-county",
 *     "zip_code": "30301"
 *   }
 * }
 * ```
 *
 * @example Legacy string format (DEPRECATED):
 * ```json
 * {
 *   "companyAddress": "123 Main Street, Atlanta, GA 30301"
 * }
 * ```
 */
/**
 * Base union for company address with backward compatibility
 * Tries structured format first, then falls back to legacy string format
 */
const CompanyAddressBaseUnion = z.union([
  // Preferred: Structured address format
  USAddressSchema,
  // Deprecated: Legacy string format (for backward compatibility)
  LegacyStringAddressSchema,
]);

/**
 * Company Address with Backward Compatibility and improved error messages
 * Uses superRefine to catch common string-specific errors and provide meaningful messages
 * (z.union returns generic "Invalid input" when all branches fail)
 */
export const CompanyAddressWithBackwardCompatSchema = z
  .any()
  .superRefine((val, ctx) => {
    // If it's a string, validate common constraints and provide meaningful errors
    // BEFORE the union fails with generic "Invalid input"
    if (typeof val === "string") {
      if (val.length > 500) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Company address cannot exceed 500 characters",
        });
        return z.NEVER; // Stop further validation
      }
      if (val.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Company address cannot be empty",
        });
        return z.NEVER;
      }
      if (val.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Company address cannot be whitespace only",
        });
        return z.NEVER;
      }
    }
  })
  .pipe(CompanyAddressBaseUnion);

export type CompanyAddressInput = z.infer<
  typeof CompanyAddressWithBackwardCompatSchema
>;

/**
 * Type guard to check if address was provided in legacy format
 * @param address - The parsed address input
 * @returns true if address was provided as a legacy string
 */
export function isLegacyAddress(
  address: CompanyAddressInput,
): address is USAddressInput & LegacyAddressMarker {
  return (address as LegacyAddressMarker)._legacy === true;
}

/**
 * User Validation Schemas
 *
 * This module provides Zod schemas for user management with role-aware validation.
 *
 * Role Types and Their Requirements:
 * ----------------------------------
 * 1. SUPERADMIN: System-level access, scope_type=SYSTEM, no company/store required
 * 2. CLIENT_OWNER: Creates and owns a company, scope_type=COMPANY
 *    - When creating: companyName + companyAddress required, company_id NOT required (created automatically)
 *    - Company is created atomically with the user
 * 3. CLIENT_USER: Cashier/Terminal Operator (Story 4.9), scope_type=STORE
 *    - ALWAYS requires company_id AND store_id
 *    - Redirects to /mystore dashboard on login
 *    - Has access only to their assigned store's terminals
 *
 * PIN Authentication:
 * ------------------
 * - PIN is a 4-digit numeric code for terminal/desktop authentication
 * - PIN uniqueness is scoped per-store (same PIN can exist at different stores)
 * - PIN is REQUIRED for: STORE_MANAGER, SHIFT_MANAGER (when creating new users)
 * - PIN is OPTIONAL for: All other roles
 * - When editing existing users with PIN, leaving PIN blank keeps current PIN
 *
 * Validation Strategy:
 * - Basic schema validates format only (UUID format, string lengths, etc.)
 * - Strict schema enforces scope-based requirements for existing user role assignments
 * - User creation schema uses superRefine for cross-field validation based on role context
 */

// =============================================================================
// Constants
// =============================================================================

/**
 * Well-known role codes in the system
 * Used for role-specific validation logic
 */
export const ROLE_CODES = {
  SUPERADMIN: "SUPERADMIN",
  CORPORATE_ADMIN: "CORPORATE_ADMIN",
  CLIENT_OWNER: "CLIENT_OWNER",
  CLIENT_USER: "CLIENT_USER",
  STORE_MANAGER: "STORE_MANAGER",
  SHIFT_MANAGER: "SHIFT_MANAGER",
} as const;

export type RoleCode = (typeof ROLE_CODES)[keyof typeof ROLE_CODES];

/**
 * Scope types for role assignments
 *
 * Scope Hierarchy:
 * - SYSTEM: Access to everything (superadmin)
 * - SUPPORT: Access to COMPANY + STORE levels (support staff) - NOT SYSTEM level
 *   SUPPORT scope users do NOT require company_id or store_id assignment
 *   as they have read access across all companies and stores for troubleshooting
 * - COMPANY: Access to company and all stores within it
 * - STORE: Access to specific store only
 *
 * SEC-010 AUTHZ: SUPPORT scope is explicitly different from SYSTEM scope
 * - SUPPORT cannot access system-level admin functions
 * - SUPPORT has cross-company read access for support purposes
 */
export const SCOPE_TYPES = {
  SYSTEM: "SYSTEM",
  SUPPORT: "SUPPORT",
  COMPANY: "COMPANY",
  STORE: "STORE",
} as const;

export type ScopeType = (typeof SCOPE_TYPES)[keyof typeof SCOPE_TYPES];

/**
 * Roles that REQUIRE PIN for terminal/desktop authentication
 * SEC-001: PIN authentication for elevated store operations
 */
export const PIN_REQUIRED_ROLES = ["STORE_MANAGER", "SHIFT_MANAGER"] as const;
export type PINRequiredRole = (typeof PIN_REQUIRED_ROLES)[number];

/**
 * PIN validation schema
 * Enforces exactly 4 numeric digits for terminal authentication
 * SEC-001 PASSWORD_HASHING compliant (will be bcrypt hashed in service layer)
 */
export const pinSchema = z
  .string()
  .regex(/^\d{4}$/, "PIN must be exactly 4 numeric digits");

// =============================================================================
// Base Schemas (Format Validation Only)
// =============================================================================

/**
 * Base role assignment schema - validates format only
 * Does NOT enforce scope-based company_id/store_id requirements
 * Use this for contexts where cross-field validation happens at a higher level
 *
 * Scope Requirements:
 * - SYSTEM: No company_id or store_id required (full system access)
 * - SUPPORT: No company_id or store_id required (cross-company read access)
 * - COMPANY: company_id required
 * - STORE: company_id AND store_id required
 *
 * API-001 VALIDATION: Strict enum validation for scope_type
 * SEC-010 AUTHZ: Scope determines access boundaries
 */
export const roleAssignmentSchema = z.object({
  role_id: z.string().uuid("Invalid role ID format"),
  scope_type: z.enum(["SYSTEM", "SUPPORT", "COMPANY", "STORE"]),
  company_id: z.string().uuid("Invalid company ID format").optional(),
  store_id: z.string().uuid("Invalid store ID format").optional(),
});

export type RoleAssignment = z.infer<typeof roleAssignmentSchema>;

// =============================================================================
// Strict Schemas (For Adding Roles to Existing Users)
// =============================================================================

/**
 * Strict role assignment schema - enforces scope-based requirements
 * Use this when assigning roles to EXISTING users where company/store must already exist
 *
 * Rules:
 * - SYSTEM scope: no company_id or store_id required (full system access)
 * - SUPPORT scope: no company_id or store_id required (cross-company read access)
 * - COMPANY scope: company_id required
 * - STORE scope: company_id AND store_id required
 *
 * SEC-010 AUTHZ: SUPPORT scope has cross-company read access without specific assignment
 * API-001 VALIDATION: Enforces scope-based requirements
 */
export const strictRoleAssignmentSchema = roleAssignmentSchema
  .refine(
    (data) => {
      // SYSTEM and SUPPORT scopes do not require company_id
      // SUPPORT has cross-company read access for troubleshooting
      if (data.scope_type === "SYSTEM" || data.scope_type === "SUPPORT") {
        return true;
      }
      if (data.scope_type === "COMPANY" || data.scope_type === "STORE") {
        return !!data.company_id;
      }
      return true;
    },
    {
      message: "Company ID is required for COMPANY and STORE scopes",
      path: ["company_id"],
    },
  )
  .refine(
    (data) => {
      if (data.scope_type === "STORE") {
        return !!data.store_id;
      }
      return true;
    },
    {
      message: "Store ID is required for STORE scope",
      path: ["store_id"],
    },
  );

// =============================================================================
// User Creation Schema
// =============================================================================

/**
 * Password validation requirements
 * Industry standard: min 8 chars, uppercase, lowercase, number, special char
 * Special characters are punctuation/symbols (not whitespace)
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
    /(?=.*[^\w\s])/,
    "Password must contain at least one special character (punctuation or symbol)",
  );

/**
 * User creation request schema with role-aware validation
 *
 * This schema validates the complete user creation payload including:
 * - Basic user fields (email, name, password)
 * - Role assignments with context-aware validation
 * - Company creation fields for CLIENT_OWNER
 * - Store assignment fields for CLIENT_USER
 * - PIN field for terminal/desktop authentication (required for STORE_MANAGER/SHIFT_MANAGER)
 *
 * Cross-field validation is performed via superRefine to ensure:
 * - CLIENT_OWNER users provide companyName and companyAddress
 * - CLIENT_USER role assignments include company_id and store_id
 * - Non-CLIENT_OWNER roles with COMPANY/STORE scope have required IDs
 * - PIN is provided for STORE_MANAGER/SHIFT_MANAGER roles (validated in service layer)
 *
 * Security: SEC-001 PASSWORD_HASHING
 * - PIN is hashed with bcrypt (salt rounds 10) in the service layer
 * - PIN uniqueness is per-store (DB-006 TENANT_ISOLATION)
 */
export const createUserSchema = z
  .object({
    // Core user fields
    email: z
      .string()
      .email("Invalid email format")
      .max(255, "Email cannot exceed 255 characters")
      .transform((val) => val.toLowerCase().trim()),

    name: z
      .string()
      .min(1, "Name is required")
      .max(255, "Name cannot exceed 255 characters")
      .refine((val) => val.trim().length > 0, {
        message: "Name cannot be whitespace only",
      }),

    password: passwordSchema.optional(),

    // Role assignments - at least one required
    roles: z
      .array(roleAssignmentSchema)
      .min(1, "At least one role is required"),

    // PIN for terminal/desktop authentication
    // Required for STORE_MANAGER and SHIFT_MANAGER roles (validated in service layer)
    // Optional for all other roles
    // SEC-001: Will be bcrypt hashed in service layer
    pin: z
      .string()
      .regex(/^\d{4}$/, "PIN must be exactly 4 numeric digits")
      .optional(),

    // CLIENT_OWNER fields: Used when creating a new company
    // The company is created atomically with the user
    companyName: z
      .string()
      .min(1, "Company name cannot be empty")
      .max(255, "Company name cannot exceed 255 characters")
      .transform((val) => val.trim())
      .optional(),

    // Company address with backward compatibility
    // Phase 4: Accepts EITHER structured format (preferred) OR legacy string (deprecated)
    // API-001 VALIDATION: Full schema validation for both formats
    // See CompanyAddressWithBackwardCompatSchema for details
    companyAddress: CompanyAddressWithBackwardCompatSchema.optional(),

    // Legacy fields for backwards compatibility
    // These are used by CLIENT_USER role assignments in the roles array
    company_id: z.string().uuid("Invalid company ID format").optional(),
    store_id: z.string().uuid("Invalid store ID format").optional(),
  })
  .superRefine((data, ctx) => {
    /**
     * Role-aware validation logic
     *
     * We need to validate based on what roles are being assigned.
     * Since we don't have the role codes at schema level (only role_ids),
     * the service layer will perform the full role-code-aware validation.
     *
     * At schema level, we enforce:
     * 1. If companyName is provided, companyAddress must also be provided (and vice versa)
     * 2. For STORE scope roles, both company_id and store_id must be in the role assignment
     * 3. For COMPANY scope roles (except during company creation), company_id must be provided
     */

    // Validate company creation fields come in pairs
    const hasCompanyName = !!data.companyName;
    const hasCompanyAddress = !!data.companyAddress;

    if (hasCompanyName && !hasCompanyAddress) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Company address is required when company name is provided",
        path: ["companyAddress"],
      });
    }

    if (hasCompanyAddress && !hasCompanyName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Company name is required when company address is provided",
        path: ["companyName"],
      });
    }

    // Validate role assignments based on scope
    // For roles that aren't creating a new company, enforce scope requirements
    const isCreatingCompany = hasCompanyName && hasCompanyAddress;

    for (let i = 0; i < data.roles.length; i++) {
      // eslint-disable-next-line security/detect-object-injection -- i is a controlled index variable
      const role = data.roles[i];

      // SYSTEM and SUPPORT scopes do not require company_id or store_id
      // SYSTEM: Full system access (superadmin)
      // SUPPORT: Cross-company read access for troubleshooting (SEC-010 AUTHZ)
      if (role.scope_type === "SYSTEM" || role.scope_type === "SUPPORT") {
        continue;
      }

      // If creating a company, COMPANY scope roles don't need company_id
      // (it will be set automatically after company creation)
      if (isCreatingCompany && role.scope_type === "COMPANY") {
        continue;
      }

      // For STORE scope, always require both company_id and store_id
      if (role.scope_type === "STORE") {
        if (!role.company_id) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Company ID is required for STORE scope role assignment",
            path: ["roles", i, "company_id"],
          });
        }
        if (!role.store_id) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Store ID is required for STORE scope role assignment",
            path: ["roles", i, "store_id"],
          });
        }
      }

      // For COMPANY scope without company creation, require company_id
      if (role.scope_type === "COMPANY" && !isCreatingCompany) {
        if (!role.company_id) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message:
              "Company ID is required for COMPANY scope role assignment (or provide companyName and companyAddress to create a new company)",
            path: ["roles", i, "company_id"],
          });
        }
      }
    }
  });

export type CreateUserInput = z.infer<typeof createUserSchema>;

// =============================================================================
// User Update Schemas
// =============================================================================

/**
 * User status update schema
 */
export const updateUserStatusSchema = z.object({
  status: z.enum(["ACTIVE", "INACTIVE"]),
});

export type UpdateUserStatusInput = z.infer<typeof updateUserStatusSchema>;

/**
 * User profile update schema (System Admin only)
 * Allows updating name, email, password, and/or PIN
 * At least one field must be provided
 *
 * PIN Update Rules:
 * - If user already has a PIN, leaving pin field empty keeps the current PIN
 * - Providing a new PIN value will update the PIN (validated for uniqueness per-store)
 * - PIN uniqueness validation happens in service layer (requires store_id context)
 *
 * Security: SEC-001 PASSWORD_HASHING, DB-006 TENANT_ISOLATION
 */
export const updateUserProfileSchema = z
  .object({
    name: z
      .string()
      .min(1, "Name cannot be empty")
      .max(255, "Name cannot exceed 255 characters")
      .refine((val) => val.trim().length > 0, {
        message: "Name cannot be whitespace only",
      })
      .transform((val) => val.trim())
      .optional(),

    email: z
      .string()
      .email("Invalid email format")
      .max(255, "Email cannot exceed 255 characters")
      .transform((val) => val.toLowerCase().trim())
      .optional(),

    password: passwordSchema.optional(),

    // PIN for terminal/desktop authentication
    // Optional: Leave empty to keep current PIN for existing users
    // SEC-001: Will be bcrypt hashed in service layer
    pin: z
      .string()
      .regex(/^\d{4}$/, "PIN must be exactly 4 numeric digits")
      .optional(),

    // Store ID required for PIN uniqueness validation (per-store scope)
    // DB-006 TENANT_ISOLATION: PIN must be unique within the store
    store_id: z.string().uuid("Invalid store ID format").optional(),
  })
  .refine(
    (data) => {
      // At least one field must be provided
      return (
        data.name !== undefined ||
        data.email !== undefined ||
        data.password !== undefined ||
        data.pin !== undefined
      );
    },
    {
      message:
        "At least one field (name, email, password, or pin) must be provided",
    },
  )
  .refine(
    (data) => {
      // If PIN is provided, store_id must also be provided for uniqueness validation
      if (data.pin && !data.store_id) {
        return false;
      }
      return true;
    },
    {
      message:
        "Store ID is required when updating PIN (for uniqueness validation)",
      path: ["store_id"],
    },
  );

export type UpdateUserProfileInput = z.infer<typeof updateUserProfileSchema>;

/**
 * Admin user PIN management schema
 * Used for dedicated PIN set/clear endpoints
 *
 * Security: SEC-001 PASSWORD_HASHING, DB-006 TENANT_ISOLATION
 */
export const setUserPINSchema = z.object({
  pin: z.string().regex(/^\d{4}$/, "PIN must be exactly 4 numeric digits"),
  store_id: z.string().uuid("Invalid store ID format"),
});

export type SetUserPINInput = z.infer<typeof setUserPINSchema>;

// =============================================================================
// Query Schemas
// =============================================================================

/**
 * List users query parameters schema
 */
export const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});

export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;

// Re-export USAddressInput for convenience
export type { USAddressInput };
