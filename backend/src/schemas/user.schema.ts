import { z } from "zod";

/**
 * Shared Zod schemas for user validation
 * Used by both API routes and tests
 */

// Role assignment schema
export const roleAssignmentSchema = z.object({
  role_id: z.string().uuid("Invalid role ID format"),
  scope_type: z.enum(["SYSTEM", "COMPANY", "STORE"]),
  company_id: z.string().uuid("Invalid company ID format").optional(),
  store_id: z.string().uuid("Invalid store ID format").optional(),
});

// User creation schema
export const createUserSchema = z.object({
  email: z
    .string()
    .email("Invalid email format")
    .max(255, "Email cannot exceed 255 characters"),
  name: z
    .string()
    .min(1, "Name is required")
    .max(255, "Name cannot exceed 255 characters")
    .refine((val) => val.trim().length > 0, {
      message: "Name cannot be whitespace only",
    }),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(255, "Password cannot exceed 255 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number")
    .regex(
      /[^A-Za-z0-9]/,
      "Password must contain at least one special character",
    )
    .optional(),
  roles: z.array(roleAssignmentSchema).min(1, "At least one role is required"),
  // Company fields for CLIENT_OWNER role
  companyName: z
    .string()
    .min(1, "Company name is required")
    .max(255, "Company name cannot exceed 255 characters")
    .optional(),
  companyAddress: z
    .string()
    .min(1, "Company address is required")
    .max(500, "Company address cannot exceed 500 characters")
    .optional(),
});

// User status update schema
export const updateUserStatusSchema = z.object({
  status: z.enum(["ACTIVE", "INACTIVE"]),
});

// List users query schema
export const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});
