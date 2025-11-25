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
 */
export interface Company {
  company_id: string;
  owner_user_id: string;
  name: string;
  address: string | null;
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
 */
export interface UpdateCompanyInput {
  name?: string;
  address?: string;
  status?: CompanyStatus;
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
