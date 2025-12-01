import { z } from "zod";

/**
 * User Validation Schemas
 *
 * This module provides Zod schemas for user management with role-aware validation.
 *
 * Role Types and Their Requirements:
 * ----------------------------------
 * 1. SYSTEM_ADMIN: System-level access, scope_type=SYSTEM, no company/store required
 * 2. CLIENT_OWNER: Creates and owns a company, scope_type=COMPANY
 *    - When creating: companyName + companyAddress required, company_id NOT required (created automatically)
 *    - Company is created atomically with the user
 * 3. CLIENT_USER: Cashier/Terminal Operator (Story 4.9), scope_type=STORE
 *    - ALWAYS requires company_id AND store_id
 *    - Redirects to /mystore dashboard on login
 *    - Has access only to their assigned store's terminals
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
  SYSTEM_ADMIN: "SYSTEM_ADMIN",
  CLIENT_OWNER: "CLIENT_OWNER",
  CLIENT_USER: "CLIENT_USER",
  STORE_MANAGER: "STORE_MANAGER",
  SHIFT_MANAGER: "SHIFT_MANAGER",
  CASHIER: "CASHIER",
} as const;

export type RoleCode = (typeof ROLE_CODES)[keyof typeof ROLE_CODES];

/**
 * Scope types for role assignments
 */
export const SCOPE_TYPES = {
  SYSTEM: "SYSTEM",
  COMPANY: "COMPANY",
  STORE: "STORE",
} as const;

export type ScopeType = (typeof SCOPE_TYPES)[keyof typeof SCOPE_TYPES];

// =============================================================================
// Base Schemas (Format Validation Only)
// =============================================================================

/**
 * Base role assignment schema - validates format only
 * Does NOT enforce scope-based company_id/store_id requirements
 * Use this for contexts where cross-field validation happens at a higher level
 */
export const roleAssignmentSchema = z.object({
  role_id: z.string().uuid("Invalid role ID format"),
  scope_type: z.enum(["SYSTEM", "COMPANY", "STORE"]),
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
 * - SYSTEM scope: no company_id or store_id required
 * - COMPANY scope: company_id required
 * - STORE scope: company_id AND store_id required
 */
export const strictRoleAssignmentSchema = roleAssignmentSchema
  .refine(
    (data) => {
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
 */
const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(255, "Password cannot exceed 255 characters")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter")
  .regex(/[0-9]/, "Password must contain at least one number")
  .regex(
    /[^A-Za-z0-9]/,
    "Password must contain at least one special character",
  );

/**
 * User creation request schema with role-aware validation
 *
 * This schema validates the complete user creation payload including:
 * - Basic user fields (email, name, password)
 * - Role assignments with context-aware validation
 * - Company creation fields for CLIENT_OWNER
 * - Store assignment fields for CLIENT_USER
 *
 * Cross-field validation is performed via superRefine to ensure:
 * - CLIENT_OWNER users provide companyName and companyAddress
 * - CLIENT_USER role assignments include company_id and store_id
 * - Non-CLIENT_OWNER roles with COMPANY/STORE scope have required IDs
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

    // CLIENT_OWNER fields: Used when creating a new company
    // The company is created atomically with the user
    companyName: z
      .string()
      .min(1, "Company name cannot be empty")
      .max(255, "Company name cannot exceed 255 characters")
      .transform((val) => val.trim())
      .optional(),

    companyAddress: z
      .string()
      .min(1, "Company address cannot be empty")
      .max(500, "Company address cannot exceed 500 characters")
      .transform((val) => val.trim())
      .optional(),

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
