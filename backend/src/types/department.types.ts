/**
 * Department Types
 *
 * TypeScript interfaces for department (product category) configuration.
 * Phase 1.2: Shift & Day Summary Implementation Plan
 */

/**
 * Department entity interface
 * Matches the Prisma Department model
 */
export interface Department {
  department_id: string;
  code: string;
  display_name: string;
  description: string | null;
  parent_id: string | null;
  level: number;
  is_taxable: boolean;
  default_tax_rate_id: string | null;
  minimum_age: number | null;
  requires_id_scan: boolean;
  is_lottery: boolean;
  sort_order: number;
  icon_name: string | null;
  color_code: string | null;
  client_id: string | null;
  is_active: boolean;
  is_system: boolean;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
}

/**
 * Department with hierarchy relations
 */
export interface DepartmentWithHierarchy extends Department {
  parent?: Department | null;
  children?: Department[];
}

/**
 * Input for creating a new department
 */
export interface DepartmentCreateInput {
  code: string;
  display_name: string;
  description?: string;
  parent_id?: string;
  is_taxable?: boolean;
  default_tax_rate_id?: string;
  minimum_age?: number;
  requires_id_scan?: boolean;
  is_lottery?: boolean;
  sort_order?: number;
  icon_name?: string;
  color_code?: string;
}

/**
 * Input for updating an existing department
 * Note: null values are used for nullable fields to explicitly clear them
 */
export interface DepartmentUpdateInput {
  display_name?: string;
  description?: string | null;
  parent_id?: string | null;
  is_taxable?: boolean;
  default_tax_rate_id?: string | null;
  minimum_age?: number | null;
  requires_id_scan?: boolean;
  is_lottery?: boolean;
  sort_order?: number;
  icon_name?: string | null;
  color_code?: string | null;
  is_active?: boolean;
}

/**
 * Query options for listing departments
 */
export interface DepartmentQueryOptions {
  client_id?: string | null;
  include_inactive?: boolean;
  include_system?: boolean;
  parent_id?: string | null;
  is_lottery?: boolean;
  include_children?: boolean;
}

/**
 * Department summary for reporting
 */
export interface DepartmentSummary {
  department_id: string;
  code: string;
  display_name: string;
  total_amount: number;
  transaction_count: number;
  line_item_count: number;
}

/**
 * Department tree node for hierarchical display
 */
export interface DepartmentTreeNode extends Department {
  children: DepartmentTreeNode[];
  depth: number;
}
