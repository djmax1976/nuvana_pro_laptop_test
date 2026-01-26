/**
 * Admin User Types
 * TypeScript types for user management and role assignment
 *
 * @enterprise-standards
 * - FE-002: FORM_VALIDATION - Types mirror backend validation schemas
 * - SEC-014: INPUT_VALIDATION - Strict type definitions for all external input
 */

import type { AddressFieldsValue } from "@/components/address";

/**
 * User status enum
 */
export enum UserStatus {
  ACTIVE = "ACTIVE",
  INACTIVE = "INACTIVE",
}

/**
 * Scope type for role assignments
 *
 * Scope Hierarchy:
 * - SYSTEM: Access to everything (superadmin)
 * - SUPPORT: Access to COMPANY + STORE levels (support staff) - NOT SYSTEM level
 *   SUPPORT scope users do NOT require company_id or store_id assignment
 *   as they have read access across all companies and stores
 * - COMPANY: Access to company and all stores within it
 * - STORE: Access to specific store only
 */
export type ScopeType = "SYSTEM" | "SUPPORT" | "COMPANY" | "STORE";

/**
 * Role detail in user response
 */
export interface UserRoleDetail {
  user_role_id: string;
  role: {
    role_id: string;
    code: string;
    description: string | null;
    scope: string;
  };
  company_id: string | null;
  company_name: string | null;
  store_id: string | null;
  store_name: string | null;
  assigned_at: string;
}

/**
 * Admin user with roles
 */
export interface AdminUser {
  user_id: string;
  email: string;
  name: string;
  status: UserStatus;
  created_at: string;
  updated_at: string;
  roles: UserRoleDetail[];
}

/**
 * Role assignment request
 */
export interface AssignRoleRequest {
  role_id: string;
  scope_type: ScopeType;
  company_id?: string;
  store_id?: string;
}

/**
 * Create user input
 * When roles include CLIENT_OWNER, companyName and companyAddress are required
 * When roles include CLIENT_USER, company_id and store_id are required in the role assignment
 *
 * Phase 2: Structured Address Implementation
 * - companyAddress now accepts AddressFieldsValue (structured object)
 * - Enables tax jurisdiction calculations, geographic filtering, and address validation
 * - Backend stores both structured fields and legacy address string for backward compatibility
 */
export interface CreateUserInput {
  email: string;
  name: string;
  password: string;
  roles: AssignRoleRequest[];
  companyName?: string;
  /** Structured company address for CLIENT_OWNER role */
  companyAddress?: AddressFieldsValue;
  company_id?: string;
  store_id?: string;
}

/**
 * Update user status input
 */
export interface UpdateUserStatusInput {
  status: UserStatus;
}

/**
 * Update user profile input (System Admin only)
 * Allows updating name, email, and/or password
 */
export interface UpdateUserProfileInput {
  name?: string;
  email?: string;
  password?: string;
}

/**
 * List users parameters
 */
export interface ListUsersParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: UserStatus;
}

/**
 * Pagination metadata
 */
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/**
 * List users response
 */
export interface ListUsersResponse {
  success: true;
  data: AdminUser[];
  meta: PaginationMeta;
}

/**
 * Single user response
 */
export interface UserResponse {
  success: true;
  data: AdminUser;
}

/**
 * User role response
 */
export interface UserRoleResponse {
  success: true;
  data: UserRoleDetail;
}

/**
 * Role for dropdown
 */
export interface RoleOption {
  role_id: string;
  code: string;
  description: string | null;
  scope: string;
}

/**
 * Roles list response
 */
export interface RolesResponse {
  success: true;
  data: RoleOption[];
}

// ============================================================================
// Hierarchical User Types (for Super Admin Dashboard)
// ============================================================================

/**
 * Store group containing users
 */
export interface StoreGroup {
  store_id: string;
  store_name: string;
  users: AdminUser[];
}

/**
 * Company group containing stores
 */
export interface CompanyGroup {
  company_id: string;
  company_name: string;
  stores: StoreGroup[];
}

/**
 * Client owner group with their companies and store users
 */
export interface ClientOwnerGroup {
  client_owner: AdminUser;
  companies: CompanyGroup[];
}

/**
 * Hierarchical users data structure
 *
 * SEC-010 AUTHZ: SUPPORT users are distinct from SYSTEM users
 * - SYSTEM: Full system access (superadmin)
 * - SUPPORT: Cross-company read access for troubleshooting (no system-level admin access)
 */
export interface HierarchicalUsersData {
  system_users: AdminUser[];
  support_users: AdminUser[];
  client_owners: ClientOwnerGroup[];
  meta: {
    total_system_users: number;
    total_support_users: number;
    total_client_owners: number;
    total_companies: number;
    total_stores: number;
    total_store_users: number;
  };
}

/**
 * Hierarchical users API response
 */
export interface HierarchicalUsersResponse {
  success: true;
  data: HierarchicalUsersData;
}

// ============================================================================
// Client Owner Setup Types (Wizard-based Atomic Creation)
// ============================================================================

/**
 * POS System Types supported by the platform
 */
export type POSSystemType =
  | "GILBARCO_PASSPORT"
  | "GILBARCO_NAXML"
  | "GILBARCO_COMMANDER"
  | "VERIFONE_RUBY2"
  | "VERIFONE_COMMANDER"
  | "VERIFONE_SAPPHIRE"
  | "CLOVER_REST"
  | "ORACLE_SIMPHONY"
  | "NCR_ALOHA"
  | "LIGHTSPEED_REST"
  | "SQUARE_REST"
  | "TOAST_REST"
  | "GENERIC_XML"
  | "GENERIC_REST"
  | "MANUAL_ENTRY";

/**
 * POS Connection Types
 */
export type POSConnectionType =
  | "NETWORK"
  | "API"
  | "WEBHOOK"
  | "FILE"
  | "MANUAL";

/**
 * User input for Client Owner Setup wizard
 */
export interface ClientOwnerSetupUserInput {
  email: string;
  name: string;
  password: string;
}

/**
 * Company input for Client Owner Setup wizard
 */
export interface ClientOwnerSetupCompanyInput {
  name: string;
  address: AddressFieldsValue;
}

/**
 * POS configuration for store
 */
export interface ClientOwnerSetupPOSConfig {
  pos_type?: POSSystemType;
  pos_connection_type?: POSConnectionType;
  pos_connection_config?: Record<string, unknown> | null;
}

/**
 * Store input for Client Owner Setup wizard
 */
export interface ClientOwnerSetupStoreInput {
  name: string;
  timezone: string;
  status?: "ACTIVE" | "INACTIVE" | "CLOSED";
  address_line1: string;
  address_line2?: string | null;
  city: string;
  state_id: string;
  county_id?: string | null;
  zip_code: string;
  pos_config?: ClientOwnerSetupPOSConfig;
}

/**
 * Store login input for Client Owner Setup wizard
 */
export interface ClientOwnerSetupStoreLoginInput {
  email: string;
  password: string;
}

/**
 * Store manager input for Client Owner Setup wizard
 * The store manager is required for desktop app functionality
 */
export interface ClientOwnerSetupStoreManagerInput {
  email: string;
  password: string;
}

/**
 * Terminal input for Client Owner Setup wizard
 */
export interface ClientOwnerSetupTerminalInput {
  name: string;
  device_id?: string | null;
  pos_type?: POSSystemType;
  connection_type?: POSConnectionType;
  connection_config?: Record<string, unknown> | null;
}

/**
 * Complete Client Owner Setup request payload
 * Used by the 5-step wizard for atomic creation
 */
export interface ClientOwnerSetupInput {
  user: ClientOwnerSetupUserInput;
  company: ClientOwnerSetupCompanyInput;
  store: ClientOwnerSetupStoreInput;
  storeLogin: ClientOwnerSetupStoreLoginInput;
  storeManager: ClientOwnerSetupStoreManagerInput;
  terminals?: ClientOwnerSetupTerminalInput[];
}

/**
 * Created user data in response
 */
export interface ClientOwnerSetupUserResponse {
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
}

/**
 * Created company data in response
 */
export interface ClientOwnerSetupCompanyResponse {
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
}

/**
 * Created store data in response
 */
export interface ClientOwnerSetupStoreResponse {
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
}

/**
 * Created store login data in response
 */
export interface ClientOwnerSetupStoreLoginResponse {
  user_id: string;
  public_id: string;
  email: string;
  name: string;
  status: string;
  created_at: string;
}

/**
 * Created store manager data in response
 */
export interface ClientOwnerSetupStoreManagerResponse {
  user_id: string;
  public_id: string;
  email: string;
  name: string;
  status: string;
  created_at: string;
}

/**
 * Created terminal data in response
 */
export interface ClientOwnerSetupTerminalResponse {
  pos_terminal_id: string;
  name: string;
  device_id: string | null;
  connection_type: string;
  pos_type: string;
}

/**
 * Complete Client Owner Setup response data
 */
export interface ClientOwnerSetupData {
  user: ClientOwnerSetupUserResponse;
  company: ClientOwnerSetupCompanyResponse;
  store: ClientOwnerSetupStoreResponse;
  storeLogin: ClientOwnerSetupStoreLoginResponse;
  storeManager: ClientOwnerSetupStoreManagerResponse;
  terminals?: ClientOwnerSetupTerminalResponse[];
}

/**
 * Client Owner Setup API success response
 */
export interface ClientOwnerSetupResponse {
  success: true;
  data: ClientOwnerSetupData;
  meta: {
    request_id: string;
    timestamp: string;
    transaction_id: string;
  };
}

/**
 * Client Owner Setup API error response with field-level details
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
