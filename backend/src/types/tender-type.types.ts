/**
 * TenderType Types
 *
 * Type definitions for the TenderType lookup table.
 * Phase 1.1: Shift & Day Summary Implementation Plan
 */

/**
 * TenderType - Represents a payment method/tender type
 */
export interface TenderType {
  tender_type_id: string;
  code: string;
  display_name: string;
  description: string | null;
  is_cash_equivalent: boolean;
  requires_reference: boolean;
  is_electronic: boolean;
  affects_cash_drawer: boolean;
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
 * Input for creating a new TenderType
 */
export interface TenderTypeCreateInput {
  code: string;
  display_name: string;
  description?: string;
  is_cash_equivalent?: boolean;
  requires_reference?: boolean;
  is_electronic?: boolean;
  affects_cash_drawer?: boolean;
  sort_order?: number;
  icon_name?: string;
  color_code?: string;
}

/**
 * Input for updating an existing TenderType
 */
export interface TenderTypeUpdateInput {
  display_name?: string;
  description?: string;
  is_cash_equivalent?: boolean;
  requires_reference?: boolean;
  is_electronic?: boolean;
  affects_cash_drawer?: boolean;
  sort_order?: number;
  icon_name?: string;
  color_code?: string;
  is_active?: boolean;
}

/**
 * TenderType summary for reports
 */
export interface TenderTypeSummary {
  tender_type_id: string;
  code: string;
  display_name: string;
  total_amount: number;
  transaction_count: number;
}

/**
 * Query options for listing tender types
 */
export interface TenderTypeQueryOptions {
  client_id?: string | null;
  include_inactive?: boolean;
  include_system?: boolean;
}

/**
 * TenderType with client info for admin views
 */
export interface TenderTypeWithClient extends TenderType {
  client?: {
    company_id: string;
    name: string;
  } | null;
}
