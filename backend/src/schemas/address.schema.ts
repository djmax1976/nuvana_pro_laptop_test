/**
 * Address Validation Schemas
 *
 * Enterprise-grade Zod schemas for US address validation.
 * Supports US states (GA, NC, SC) with FIPS codes, counties, cities, and ZIP codes.
 *
 * @enterprise-standards
 * - API-001: VALIDATION - Schema validation for every request payload
 * - SEC-014: INPUT_VALIDATION - Strict allowlists and sanitization
 * - FE-002: FORM_VALIDATION - Mirror backend validation client-side
 *
 * Geographic Hierarchy: State > County > City > ZIP
 * FIPS Codes: 2-digit state (e.g., "13" for GA), 5-digit county (e.g., "13121" for Fulton)
 */

import { z } from "zod";

// =============================================================================
// Constants
// =============================================================================

/**
 * US State codes supported by the system
 * ISO 3166-2:US compliant 2-letter codes
 */
export const SUPPORTED_STATE_CODES = ["GA", "NC", "SC"] as const;
export type SupportedStateCode = (typeof SUPPORTED_STATE_CODES)[number];

/**
 * FIPS codes for supported states
 * Federal Information Processing Standard codes
 */
export const STATE_FIPS_CODES = {
  GA: "13",
  NC: "37",
  SC: "45",
} as const;

// =============================================================================
// Base Field Schemas
// =============================================================================

/**
 * US State Code Schema
 * Validates ISO 3166-2:US 2-letter state code
 */
export const StateCodeSchema = z
  .string()
  .length(2, "State code must be exactly 2 characters")
  .toUpperCase()
  .refine((val) => SUPPORTED_STATE_CODES.includes(val as SupportedStateCode), {
    message: `State code must be one of: ${SUPPORTED_STATE_CODES.join(", ")}`,
  });

/**
 * State FIPS Code Schema
 * Validates 2-digit Federal Information Processing Standard state code
 */
export const StateFipsCodeSchema = z
  .string()
  .length(2, "State FIPS code must be exactly 2 digits")
  .regex(/^[0-9]{2}$/, "State FIPS code must be 2 digits");

/**
 * County FIPS Code Schema
 * Validates 5-digit FIPS code (2-digit state + 3-digit county)
 */
export const CountyFipsCodeSchema = z
  .string()
  .length(5, "County FIPS code must be exactly 5 digits")
  .regex(/^[0-9]{5}$/, "County FIPS code must be 5 digits");

/**
 * ZIP Code Schema
 * Validates US 5-digit postal code
 */
export const ZipCodeSchema = z
  .string()
  .length(5, "ZIP code must be exactly 5 digits")
  .regex(/^[0-9]{5}$/, "ZIP code must be 5 digits");

/**
 * ZIP+4 Code Schema
 * Validates US 9-digit postal code (5-digit + 4-digit extension)
 */
export const ZipPlus4Schema = z.string().refine(
  (val) => {
    // Match 5 digits OR 5 digits + dash + 4 digits
    if (val.length === 5) {
      return /^[0-9]{5}$/.test(val);
    }
    if (val.length === 10 && val[5] === "-") {
      return (
        /^[0-9]{5}$/.test(val.slice(0, 5)) && /^[0-9]{4}$/.test(val.slice(6))
      );
    }
    return false;
  },
  { message: "ZIP code must be in format 12345 or 12345-6789" },
);

/**
 * Address Line Schema
 * Validates street address lines with proper sanitization
 */
export const AddressLineSchema = z
  .string()
  .min(1, "Address line cannot be empty")
  .max(255, "Address line cannot exceed 255 characters")
  .transform((val) => val.trim())
  .refine((val) => val.length > 0, {
    message: "Address line cannot be whitespace only",
  });

/**
 * City Name Schema
 * Validates city names with proper sanitization
 */
export const CityNameSchema = z
  .string()
  .min(1, "City name cannot be empty")
  .max(100, "City name cannot exceed 100 characters")
  .transform((val) => val.trim())
  .refine((val) => val.length > 0, {
    message: "City name cannot be whitespace only",
  });

/**
 * County Name Schema
 * Validates county names with proper sanitization
 */
export const CountyNameSchema = z
  .string()
  .min(1, "County name cannot be empty")
  .max(100, "County name cannot exceed 100 characters")
  .transform((val) => val.trim())
  .refine((val) => val.length > 0, {
    message: "County name cannot be whitespace only",
  });

// =============================================================================
// Composite Address Schemas
// =============================================================================

/**
 * US Address Schema (Full)
 * Complete US mailing address with all geographic reference IDs
 * Used for Store and Company address management
 */
export const USAddressSchema = z.object({
  address_line1: AddressLineSchema,
  address_line2: z
    .string()
    .max(255, "Address line 2 cannot exceed 255 characters")
    .transform((val) => val.trim())
    .optional()
    .nullable(),
  city: CityNameSchema,
  state_id: z.string().uuid("state_id must be a valid UUID"),
  county_id: z
    .string()
    .uuid("county_id must be a valid UUID")
    .optional()
    .nullable(),
  zip_code: ZipPlus4Schema,
});

export type USAddressInput = z.infer<typeof USAddressSchema>;

/**
 * US Address Schema (Partial Update)
 * For PATCH operations where not all fields are required
 */
export const USAddressPartialSchema = z.object({
  address_line1: AddressLineSchema.optional(),
  address_line2: z
    .string()
    .max(255, "Address line 2 cannot exceed 255 characters")
    .transform((val) => val.trim())
    .optional()
    .nullable(),
  city: CityNameSchema.optional(),
  state_id: z.string().uuid("state_id must be a valid UUID").optional(),
  county_id: z
    .string()
    .uuid("county_id must be a valid UUID")
    .optional()
    .nullable(),
  zip_code: ZipPlus4Schema.optional(),
});

export type USAddressPartialInput = z.infer<typeof USAddressPartialSchema>;

/**
 * Store Address Assignment Schema
 * For assigning a store to a geographic location
 * state_id is CRITICAL - determines which lottery games are visible
 */
export const StoreAddressAssignmentSchema = z.object({
  address_line1: AddressLineSchema.optional(),
  address_line2: z
    .string()
    .max(255, "Address line 2 cannot exceed 255 characters")
    .transform((val) => val.trim())
    .optional()
    .nullable(),
  city: CityNameSchema.optional(),
  state_id: z
    .string()
    .uuid("state_id must be a valid UUID - determines lottery game visibility"),
  county_id: z
    .string()
    .uuid("county_id must be a valid UUID")
    .optional()
    .nullable(),
  zip_code: ZipPlus4Schema.optional(),
});

export type StoreAddressAssignmentInput = z.infer<
  typeof StoreAddressAssignmentSchema
>;

// =============================================================================
// Geographic Reference Entity Schemas
// =============================================================================

/**
 * Create US State Schema (SuperAdmin only)
 * For adding new states to the system
 */
export const CreateUSStateSchema = z.object({
  code: StateCodeSchema,
  name: z
    .string()
    .min(1, "State name cannot be empty")
    .max(100, "State name cannot exceed 100 characters")
    .transform((val) => val.trim()),
  fips_code: StateFipsCodeSchema,
  is_active: z.boolean().default(true),
  lottery_enabled: z.boolean().default(true),
  timezone_default: z
    .string()
    .max(50, "Timezone cannot exceed 50 characters")
    .optional()
    .nullable(),
  tax_rate_state: z
    .number()
    .min(0, "Tax rate cannot be negative")
    .max(1, "Tax rate cannot exceed 100%")
    .optional()
    .nullable(),
  lottery_commission_name: z
    .string()
    .max(255, "Commission name cannot exceed 255 characters")
    .optional()
    .nullable(),
  lottery_commission_phone: z
    .string()
    .max(20, "Commission phone cannot exceed 20 characters")
    .regex(/^[+]?[\d\s\-().]*$/, "Invalid phone number format")
    .optional()
    .nullable(),
  lottery_commission_url: z
    .string()
    .url("Invalid URL format")
    .max(500, "Commission URL cannot exceed 500 characters")
    .optional()
    .nullable(),
});

export type CreateUSStateInput = z.infer<typeof CreateUSStateSchema>;

/**
 * Update US State Schema (SuperAdmin only)
 */
export const UpdateUSStateSchema = z
  .object({
    name: z
      .string()
      .min(1, "State name cannot be empty")
      .max(100, "State name cannot exceed 100 characters")
      .transform((val) => val.trim())
      .optional(),
    is_active: z.boolean().optional(),
    lottery_enabled: z.boolean().optional(),
    timezone_default: z.string().max(50).optional().nullable(),
    tax_rate_state: z.number().min(0).max(1).optional().nullable(),
    lottery_commission_name: z.string().max(255).optional().nullable(),
    lottery_commission_phone: z
      .string()
      .max(20)
      .regex(/^[+]?[\d\s\-().]*$/, "Invalid phone number format")
      .optional()
      .nullable(),
    lottery_commission_url: z.string().url().max(500).optional().nullable(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided for update",
  });

export type UpdateUSStateInput = z.infer<typeof UpdateUSStateSchema>;

/**
 * Create US County Schema
 */
export const CreateUSCountySchema = z.object({
  state_id: z.string().uuid("state_id must be a valid UUID"),
  name: CountyNameSchema,
  fips_code: CountyFipsCodeSchema,
  is_active: z.boolean().default(true),
  tax_rate_county: z.number().min(0).max(1).optional().nullable(),
  population: z.number().int().positive().optional().nullable(),
  county_seat: z.string().max(100).optional().nullable(),
});

export type CreateUSCountyInput = z.infer<typeof CreateUSCountySchema>;

/**
 * Create US City Schema
 */
export const CreateUSCitySchema = z.object({
  state_id: z.string().uuid("state_id must be a valid UUID"),
  county_id: z.string().uuid("county_id must be a valid UUID"),
  name: CityNameSchema,
  is_active: z.boolean().default(true),
  is_incorporated: z.boolean().default(true),
  tax_rate_city: z.number().min(0).max(1).optional().nullable(),
  population: z.number().int().positive().optional().nullable(),
});

export type CreateUSCityInput = z.infer<typeof CreateUSCitySchema>;

/**
 * Create US ZIP Code Schema
 */
export const CreateUSZipCodeSchema = z.object({
  zip_code: ZipCodeSchema,
  state_id: z.string().uuid("state_id must be a valid UUID"),
  county_id: z
    .string()
    .uuid("county_id must be a valid UUID")
    .optional()
    .nullable(),
  city_id: z
    .string()
    .uuid("city_id must be a valid UUID")
    .optional()
    .nullable(),
  city_name: CityNameSchema,
  is_active: z.boolean().default(true),
  is_primary: z.boolean().default(true),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  zip_type: z.string().max(20).optional().nullable(),
});

export type CreateUSZipCodeInput = z.infer<typeof CreateUSZipCodeSchema>;

// =============================================================================
// Query Parameter Schemas
// =============================================================================

/**
 * List States Query Schema
 */
export const ListStatesQuerySchema = z.object({
  is_active: z
    .string()
    .transform((val) => val === "true")
    .optional(),
  lottery_enabled: z
    .string()
    .transform((val) => val === "true")
    .optional(),
});

export type ListStatesQuery = z.infer<typeof ListStatesQuerySchema>;

/**
 * List Counties Query Schema
 */
export const ListCountiesQuerySchema = z.object({
  state_id: z.string().uuid("state_id must be a valid UUID").optional(),
  state_code: StateCodeSchema.optional(),
  is_active: z
    .string()
    .transform((val) => val === "true")
    .optional(),
  search: z.string().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type ListCountiesQuery = z.infer<typeof ListCountiesQuerySchema>;

/**
 * List Cities Query Schema
 */
export const ListCitiesQuerySchema = z.object({
  state_id: z.string().uuid("state_id must be a valid UUID").optional(),
  state_code: StateCodeSchema.optional(),
  county_id: z.string().uuid("county_id must be a valid UUID").optional(),
  is_active: z
    .string()
    .transform((val) => val === "true")
    .optional(),
  search: z.string().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type ListCitiesQuery = z.infer<typeof ListCitiesQuerySchema>;

/**
 * List ZIP Codes Query Schema
 */
export const ListZipCodesQuerySchema = z.object({
  state_id: z.string().uuid("state_id must be a valid UUID").optional(),
  state_code: StateCodeSchema.optional(),
  county_id: z.string().uuid("county_id must be a valid UUID").optional(),
  city_id: z.string().uuid("city_id must be a valid UUID").optional(),
  city_name: z.string().max(100).optional(),
  is_active: z
    .string()
    .transform((val) => val === "true")
    .optional(),
  search: z.string().max(10).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

export type ListZipCodesQuery = z.infer<typeof ListZipCodesQuerySchema>;

/**
 * ZIP Code Lookup Query Schema
 * For address autocomplete functionality
 */
export const ZipCodeLookupQuerySchema = z.object({
  zip_code: ZipCodeSchema,
});

export type ZipCodeLookupQuery = z.infer<typeof ZipCodeLookupQuerySchema>;

// =============================================================================
// Validation Helper Functions
// =============================================================================

/**
 * Validate US Address input
 * @param data - Raw address data
 * @returns Validated and typed US address input
 * @throws ZodError if validation fails
 */
export function validateUSAddress(data: unknown): USAddressInput {
  return USAddressSchema.parse(data);
}

/**
 * Safe validation for US Address
 * @param data - Raw address data
 * @returns SafeParseResult with success flag and data/error
 */
export function safeValidateUSAddress(data: unknown) {
  return USAddressSchema.safeParse(data);
}

/**
 * Validate Store Address Assignment
 * @param data - Raw address data
 * @returns Validated and typed store address input
 * @throws ZodError if validation fails
 */
export function validateStoreAddressAssignment(
  data: unknown,
): StoreAddressAssignmentInput {
  return StoreAddressAssignmentSchema.parse(data);
}

/**
 * Safe validation for Store Address Assignment
 * @param data - Raw address data
 * @returns SafeParseResult with success flag and data/error
 */
export function safeValidateStoreAddressAssignment(data: unknown) {
  return StoreAddressAssignmentSchema.safeParse(data);
}

/**
 * Validate Create US State input (SuperAdmin only)
 * @param data - Raw state data
 * @returns Validated and typed state input
 * @throws ZodError if validation fails
 */
export function validateCreateUSState(data: unknown): CreateUSStateInput {
  return CreateUSStateSchema.parse(data);
}

/**
 * Safe validation for Create US State
 * @param data - Raw state data
 * @returns SafeParseResult with success flag and data/error
 */
export function safeValidateCreateUSState(data: unknown) {
  return CreateUSStateSchema.safeParse(data);
}

/**
 * Validate Update US State input (SuperAdmin only)
 * @param data - Raw state data
 * @returns Validated and typed state update input
 * @throws ZodError if validation fails
 */
export function validateUpdateUSState(data: unknown): UpdateUSStateInput {
  return UpdateUSStateSchema.parse(data);
}

/**
 * Safe validation for Update US State
 * @param data - Raw state data
 * @returns SafeParseResult with success flag and data/error
 */
export function safeValidateUpdateUSState(data: unknown) {
  return UpdateUSStateSchema.safeParse(data);
}

/**
 * Validate List States query parameters
 * @param data - Raw query parameters
 * @returns Validated and typed query parameters
 * @throws ZodError if validation fails
 */
export function validateListStatesQuery(data: unknown): ListStatesQuery {
  return ListStatesQuerySchema.parse(data);
}

/**
 * Validate List Counties query parameters
 * @param data - Raw query parameters
 * @returns Validated and typed query parameters
 * @throws ZodError if validation fails
 */
export function validateListCountiesQuery(data: unknown): ListCountiesQuery {
  return ListCountiesQuerySchema.parse(data);
}

/**
 * Validate List Cities query parameters
 * @param data - Raw query parameters
 * @returns Validated and typed query parameters
 * @throws ZodError if validation fails
 */
export function validateListCitiesQuery(data: unknown): ListCitiesQuery {
  return ListCitiesQuerySchema.parse(data);
}

/**
 * Validate List ZIP Codes query parameters
 * @param data - Raw query parameters
 * @returns Validated and typed query parameters
 * @throws ZodError if validation fails
 */
export function validateListZipCodesQuery(data: unknown): ListZipCodesQuery {
  return ListZipCodesQuerySchema.parse(data);
}

/**
 * Validate ZIP Code Lookup query
 * @param data - Raw query parameters
 * @returns Validated and typed query parameters
 * @throws ZodError if validation fails
 */
export function validateZipCodeLookup(data: unknown): ZipCodeLookupQuery {
  return ZipCodeLookupQuerySchema.parse(data);
}
