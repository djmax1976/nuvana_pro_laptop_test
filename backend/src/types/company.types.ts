/**
 * Company type definitions
 * Used across backend services, routes, and tests
 */

/**
 * Company status type
 */
export type CompanyStatus = "ACTIVE" | "INACTIVE" | "SUSPENDED" | "PENDING";

/**
 * Company entity with all fields
 *
 * @enterprise-standards
 * - Supports both legacy address field and structured address fields
 * - Structured fields (state_id, county_id, city, zip_code) should be preferred
 */
export interface Company {
  company_id: string;
  owner_user_id: string;
  name: string;
  /** @deprecated Use structured address fields instead */
  address: string | null;
  // === Structured Address Fields ===
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  state_id?: string | null;
  county_id?: string | null;
  zip_code?: string | null;
  status: string;
  created_at: Date;
  updated_at: Date;
}

/**
 * Company with owner information for responses
 */
export interface CompanyWithOwner extends Company {
  owner_name?: string;
  owner_email?: string;
  owner?: {
    user_id: string;
    name: string;
    email: string;
  } | null;
  // Related geographic entities (populated on update responses)
  state?: {
    state_id: string;
    code: string;
    name: string;
  } | null;
  county?: {
    county_id: string;
    name: string;
  } | null;
}

/**
 * Company creation input
 */
export interface CreateCompanyInput {
  owner_user_id: string; // Required for new companies
  name: string;
  address?: string;
  status?: CompanyStatus;
}

/**
 * Company update input
 * Note: owner_user_id is immutable after creation
 *
 * @enterprise-standards
 * - API-001: VALIDATION - All inputs validated via Zod schemas
 * - SEC-014: INPUT_VALIDATION - Strict validation for address fields
 */
export interface UpdateCompanyInput {
  name?: string;
  /** @deprecated Use structured address fields instead */
  address?: string;
  status?: CompanyStatus;
  // === Structured Address Fields ===
  /** Street address line 1 (e.g., "123 Main Street") */
  address_line1?: string;
  /** Street address line 2 (e.g., "Suite 100") */
  address_line2?: string | null;
  /** City name (denormalized for display) */
  city?: string;
  /** FK to us_states - determines lottery game visibility */
  state_id?: string;
  /** FK to us_counties - for tax jurisdiction */
  county_id?: string;
  /** ZIP code (5-digit or ZIP+4 format) */
  zip_code?: string;
}

/**
 * Company list query options
 */
export interface CompanyListOptions {
  page?: number;
  limit?: number;
  status?: CompanyStatus;
  ownerUserId?: string;
  search?: string;
}

/**
 * Paginated company result
 */
export interface PaginatedCompanyResult {
  data: CompanyWithOwner[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Audit context for logging operations
 */
export interface AuditContext {
  userId: string;
  userEmail: string;
  userRoles: string[];
  ipAddress: string | null;
  userAgent: string | null;
}
