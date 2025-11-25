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
  client_id: string | null;
  name: string;
  address: string | null;
  status: string;
  created_at: Date;
  updated_at: Date;
}

/**
 * Company with client information for responses
 */
export interface CompanyWithClient extends Company {
  client_name?: string;
  client?: {
    client_id: string;
    name: string;
  } | null;
}

/**
 * Company creation input
 */
export interface CreateCompanyInput {
  client_id: string; // Required for new companies
  name: string;
  address?: string;
  status?: CompanyStatus;
}

/**
 * Company update input
 */
export interface UpdateCompanyInput {
  client_id?: string;
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
  clientId?: string;
}

/**
 * Paginated company result
 */
export interface PaginatedCompanyResult {
  data: CompanyWithClient[];
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
